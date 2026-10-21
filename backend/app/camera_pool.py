"""
camera_pool.py - Background RTSP worker pool for 10+ simultaneous cameras.

One daemon thread per active camera continuously reads frames and caches the
latest. The snapshot and stream endpoints serve from cache - no RTSP handshake
per request. Workers auto-reconnect on stream loss.
"""
import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

CAMERA_OPEN_TIMEOUT_MS = int(os.getenv("CAMERA_OPEN_TIMEOUT_MS", "5000"))
CAMERA_READ_TIMEOUT_MS = int(os.getenv("CAMERA_READ_TIMEOUT_MS", "5000"))

_RECONNECT_BASE  = 3      # seconds - initial reconnect delay
_RECONNECT_MAX   = 60     # seconds - max reconnect delay (exponential backoff cap)
_MAX_FRAME_AGE   = 5.0    # seconds - treat frame as stale after this


class CameraWorker:
    """Reads frames from a single RTSP stream in a background daemon thread."""

    def __init__(self, camera_id: int, rtsp_url: str) -> None:
        self.camera_id   = camera_id
        self.rtsp_url    = rtsp_url
        self._lock       = threading.Lock()
        self._latest_frame: Optional[np.ndarray] = None
        self._frame_time: float  = 0.0
        self._connected: bool    = False
        self._running:   bool    = False
        self._thread: Optional[threading.Thread] = None
        self._fail_count: int    = 0   # consecutive failures в†’ exponential backoff
        self._last_error: Optional[str] = None
        self._last_connected_at: Optional[datetime] = None
        self._last_frame_at: Optional[datetime] = None
        self._next_retry_at: Optional[datetime] = None

    # -- Public API -------------------------------------------------------------

    def start(self) -> None:
        self._running = True
        self._thread  = threading.Thread(
            target=self._loop,
            daemon=True,
            name=f"cam-{self.camera_id}",
        )
        self._thread.start()
        logger.info("Camera worker started: id=%d", self.camera_id)

    def stop(self) -> None:
        self._running = False

    def get_latest_frame(self) -> Tuple[bool, Optional[np.ndarray]]:
        """Return (ok, frame_copy). ok=False when no recent frame is available."""
        with self._lock:
            if self._latest_frame is None:
                return False, None
            if time.monotonic() - self._frame_time > _MAX_FRAME_AGE:
                return False, None
            return True, self._latest_frame.copy()

    @property
    def is_connected(self) -> bool:
        with self._lock:
            return self._connected

    def status(self) -> dict:
        with self._lock:
            frame_age = time.monotonic() - self._frame_time if self._frame_time else None
            return {
                "connected": self._connected,
                "failure_count": self._fail_count,
                "last_error": self._last_error,
                "last_connected_at": self._last_connected_at.isoformat() if self._last_connected_at else None,
                "last_frame_at": self._last_frame_at.isoformat() if self._last_frame_at else None,
                "frame_age_seconds": round(frame_age, 2) if frame_age is not None else None,
                "next_retry_at": self._next_retry_at.isoformat() if self._next_retry_at else None,
            }

    # -- Internal ---------------------------------------------------------------

    def _open_capture(self) -> Tuple[cv2.VideoCapture, bool]:
        cap = cv2.VideoCapture()
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, CAMERA_OPEN_TIMEOUT_MS)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC,  CAMERA_READ_TIMEOUT_MS)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        api = getattr(cv2, "CAP_FFMPEG", 0)
        try:
            opened = cap.open(self.rtsp_url, api) if api else cap.open(self.rtsp_url)
        except Exception:
            opened = False
        if not opened and api:
            cap.release()
            cap = cv2.VideoCapture()
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, CAMERA_OPEN_TIMEOUT_MS)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC,  CAMERA_READ_TIMEOUT_MS)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            opened = cap.open(self.rtsp_url)
        return cap, bool(opened)

    def _loop(self) -> None:
        while self._running:
            cap, opened = self._open_capture()
            if not opened:
                cap.release()
                with self._lock:
                    self._connected = False
                delay = min(_RECONNECT_BASE * (2 ** self._fail_count), _RECONNECT_MAX)
                self._fail_count += 1
                with self._lock:
                    self._last_error = "Unable to open RTSP stream"
                    self._next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
                logger.warning(
                    "Camera worker %d: cannot open RTSP, retry in %.0fs (attempt %d)",
                    self.camera_id, delay, self._fail_count,
                )
                time.sleep(delay)
                continue

            # Successful connection - reset backoff counter
            self._fail_count = 0
            with self._lock:
                self._connected = True
                self._last_error = None
                self._last_connected_at = datetime.now(timezone.utc)
                self._next_retry_at = None
            logger.info("Camera worker %d: RTSP connected", self.camera_id)

            try:
                while self._running:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    with self._lock:
                        self._latest_frame = frame
                        self._frame_time   = time.monotonic()
                        self._last_frame_at = datetime.now(timezone.utc)
            finally:
                cap.release()

            with self._lock:
                self._connected = False
                self._last_error = "RTSP stream ended"

            if self._running:
                delay = min(_RECONNECT_BASE * (2 ** self._fail_count), _RECONNECT_MAX)
                self._fail_count += 1
                with self._lock:
                    self._next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
                logger.info(
                    "Camera worker %d: stream ended, reconnect in %.0fs",
                    self.camera_id, delay,
                )
                time.sleep(delay)


class CameraWorkerPool:
    """Manages one CameraWorker per active camera. Thread-safe."""

    def __init__(self) -> None:
        self._workers: Dict[int, CameraWorker] = {}
        self._lock = threading.Lock()

    def start_worker(self, camera_id: int, rtsp_url: str) -> None:
        with self._lock:
            existing = self._workers.get(camera_id)
            if existing:
                existing.stop()
            worker = CameraWorker(camera_id, rtsp_url)
            worker.start()
            self._workers[camera_id] = worker

    def stop_worker(self, camera_id: int) -> None:
        with self._lock:
            worker = self._workers.pop(camera_id, None)
        if worker:
            worker.stop()

    def stop_all(self) -> None:
        with self._lock:
            workers = list(self._workers.values())
            self._workers.clear()
        for w in workers:
            w.stop()
        logger.info("All camera workers stopped (%d total)", len(workers))

    def get_frame(self, camera_id: int) -> Tuple[bool, Optional[np.ndarray]]:
        with self._lock:
            worker = self._workers.get(camera_id)
        if worker is None:
            return False, None
        return worker.get_latest_frame()

    def has_worker(self, camera_id: int) -> bool:
        with self._lock:
            return camera_id in self._workers

    def status(self) -> dict:
        with self._lock:
            return {cid: worker.status() for cid, worker in self._workers.items()}


# Module-level singleton - imported by cameras.py and main.py
camera_pool = CameraWorkerPool()
