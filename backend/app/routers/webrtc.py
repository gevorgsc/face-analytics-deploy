"""
webrtc.py — WebRTC live stream for Hikvision SDK cameras.

Pipeline:
  HikSdkH264Session (YV12 frames)
    → HikVideoTrack (aiortc VideoStreamTrack)
      → RTCPeerConnection (WebRTC)
        → Browser <video> element

Signaling:
  POST /api/webrtc/{camera_id}/offer  — browser sends SDP offer, server replies with SDP answer

Latency: ~80-150ms vs MJPEG's ~500-2000ms.
"""

import asyncio
import fractions
import logging
import os
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.auth import get_current_user
from app.models import CameraDevice, User
from app.secrets import decrypt_camera_password

logger = logging.getLogger(__name__)
router = APIRouter(tags=["webrtc"])

try:
    import av
    from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
    from aiortc.contrib.media import MediaRelay
    WEBRTC_AVAILABLE = True
except ImportError:
    WEBRTC_AVAILABLE = False
    logger.warning("aiortc not installed — WebRTC endpoints disabled. pip install aiortc")


# ── HikSDK → aiortc VideoTrack ────────────────────────────────────────────────

if WEBRTC_AVAILABLE:
    import numpy as np
    import time as _wtime

    class HikVideoTrack(VideoStreamTrack):
        """
        Direct YUV420p path — no JPEG encode/decode roundtrip.
        YV12 frames are plane-swapped to YUV420p in hiksdk_client and passed
        straight to av.VideoFrame.  PTS uses real wall-clock time (90 kHz)
        so long-running streams never drift.
        """

        kind = "video"
        _TIME_BASE = fractions.Fraction(1, 90000)

        def __init__(self, session):
            super().__init__()
            self._session    = session
            self._last_stamp = 0

        async def recv(self):
            loop = asyncio.get_running_loop()

            yuv, w, h, stamp = await loop.run_in_executor(
                None, self._session.wait_for_yuv, self._last_stamp, 5.0
            )

            # Real wall-clock PTS — prevents long-session drift
            pts = int(_wtime.monotonic() * 90000)

            if not yuv or not w or not h or stamp == self._last_stamp:
                blank = av.VideoFrame(width=640, height=480, format="yuv420p")
                blank.pts = pts
                blank.time_base = self._TIME_BASE
                return blank

            self._last_stamp = stamp

            # YUV420p bytes → numpy (height*3//2, width) → av.VideoFrame
            # No JPEG encode/decode — raw plane data straight to av
            arr = np.frombuffer(yuv, dtype=np.uint8).reshape((h * 3 // 2, w))
            frame = av.VideoFrame.from_ndarray(arr, format="yuv420p")
            frame.pts       = pts
            frame.time_base = self._TIME_BASE
            return frame


# ── Active PeerConnections (cleanup on disconnect) ────────────────────────────

_pcs: set = set()


# ── Signaling endpoint ────────────────────────────────────────────────────────

if WEBRTC_AVAILABLE:
    @router.post("/api/webrtc/{camera_id}/offer")
    async def webrtc_offer(
        camera_id: int,
        body: dict,
        stream_type: Optional[int] = 0,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ):
        """
        Browser sends: { "sdp": "...", "type": "offer" }
        Server returns: { "sdp": "...", "type": "answer" }
        """
        camera = db.get(CameraDevice, camera_id)
        if not camera:
            raise HTTPException(404, "Camera not found")
        if not camera.is_active or not camera.live_enabled:
            raise HTTPException(403, "Live stream disabled")
        if (camera.snapshot_mode or "hiksdk") != "hiksdk":
            raise HTTPException(400, "WebRTC requires Hikvision SDK mode")

        # Channel with stream type
        from app.hiksdk_client import _pool_key, _get_or_create_session, _sdk_stream_type
        base_channel = camera.channel or 101
        if stream_type in (0, 1, 2):
            chan_base = max(1, base_channel // 100) if base_channel >= 100 else max(1, base_channel)
            base_channel = chan_base * 100 + stream_type + 1

        password = decrypt_camera_password(camera.password or "")
        session, is_new = _get_or_create_session(
            camera.ip_address, camera.port or 8000,
            base_channel, camera.username or "", password,
            jpeg_quality=82, max_fps=0.0,
        )

        loop = asyncio.get_running_loop()
        if is_new:
            await loop.run_in_executor(None, session.start)

        # Build RTCPeerConnection
        pc = RTCPeerConnection()
        _pcs.add(pc)

        @pc.on("connectionstatechange")
        async def on_state():
            logger.info("WebRTC [cam %s] state: %s", camera_id, pc.connectionState)
            if pc.connectionState in ("failed", "closed", "disconnected"):
                await pc.close()
                _pcs.discard(pc)

        # Add video track
        track = HikVideoTrack(session)
        pc.addTrack(track)

        # Process SDP offer → generate answer
        offer = RTCSessionDescription(sdp=body["sdp"], type=body["type"])
        await pc.setRemoteDescription(offer)
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        return JSONResponse({
            "sdp":  pc.localDescription.sdp,
            "type": pc.localDescription.type,
        })

else:
    @router.post("/api/webrtc/{camera_id}/offer")
    async def webrtc_offer_unavailable(camera_id: int):
        raise HTTPException(501, "WebRTC not available — install aiortc: pip install aiortc")
