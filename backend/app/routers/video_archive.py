"""SDK-native camera archive recording and export.

Archive capture is performed exclusively with Hikvision HCNetSDK.  No RTSP URL
is created, stored, or used by this module.  HCNetSDK writes the device preview
stream to local storage and, when possible, the completed SDK file is remuxed to
MP4 for convenient browser playback and export.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.hiksdk_client import HikSdkRecordingSession, hiksdk_recording_start_sync
from app.models import CameraDevice, User
from app.secrets import decrypt_camera_password
from app.utils import EXPORT_DIR, MEDIA_DIR, add_audit_log


router = APIRouter(tags=["video-archive"])

ARCHIVE_ROOT = Path(MEDIA_DIR) / "sdk_archives"
EXPORT_ROOT = Path(EXPORT_DIR) / "sdk_archives"
ALLOWED_ARCHIVE_SUFFIXES = {".mp4", ".ps"}


@dataclass
class ActiveRecording:
    camera_id: int
    recorder: HikSdkRecordingSession
    started_at: datetime
    source_path: Path


_active_recordings: dict[int, ActiveRecording] = {}
_recording_lock = threading.RLock()


def _camera_directory(camera_id: int) -> Path:
    directory = ARCHIVE_ROOT / f"camera_{camera_id}"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _archive_path(camera_id: int, filename: str) -> Path:
    safe_name = Path(filename).name
    if safe_name != filename or Path(safe_name).suffix.lower() not in ALLOWED_ARCHIVE_SUFFIXES:
        raise HTTPException(404, "Archive file not found")
    path = (_camera_directory(camera_id) / safe_name).resolve()
    root = _camera_directory(camera_id).resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "Archive file not found")
    return path


def _export_path(camera_id: int, filename: str) -> Path:
    safe_name = Path(filename).name
    if safe_name != filename or Path(safe_name).suffix.lower() != ".mp4":
        raise HTTPException(404, "Export file not found")
    folder = EXPORT_ROOT / f"camera_{camera_id}"
    path = (folder / safe_name).resolve()
    if folder.resolve() not in path.parents or not path.is_file():
        raise HTTPException(404, "Export file not found")
    return path


def _camera_or_404(db: Session, camera_id: int) -> CameraDevice:
    camera = db.get(CameraDevice, camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")
    if not camera.is_active:
        raise HTTPException(409, "Camera is inactive")
    if (camera.snapshot_mode or "hiksdk").lower() != "hiksdk":
        raise HTTPException(400, "SDK archive recording is available only for Hikvision SDK cameras")
    if not camera.username or not camera.password:
        raise HTTPException(400, "Camera SDK credentials are required for archive recording")
    return camera


def _serialize_file(camera_id: int, file_path: Path) -> dict[str, Any]:
    stat = file_path.stat()
    suffix = file_path.suffix.lower()
    return {
        "filename": file_path.name,
        "format": "mp4" if suffix == ".mp4" else "sdk_raw",
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "download_url": f"/api/video-archive/cameras/{camera_id}/segments/{file_path.name}/download",
    }


def _remux_sdk_recording(source: Path) -> tuple[Path, str]:
    """Create an MP4 without reconnecting to the camera.

    HCNetSDK produces the source file.  FFmpeg only repackages that already
    recorded SDK file after Stop is pressed; it never opens a camera/RTSP stream.
    """
    if not source.exists() or source.stat().st_size == 0:
        return source, "sdk_raw"

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return source, "sdk_raw"

    target = source.with_suffix(".mp4")
    result = subprocess.run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source),
            # Hikvision SDK archives can contain G.711 (PCM A-law) audio,
            # which MP4 does not support as a copied stream.  Keep the source
            # video untouched and convert only audio to browser-compatible AAC.
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "64k",
            "-movflags",
            "+faststart",
            str(target),
        ],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if result.returncode == 0 and target.exists() and target.stat().st_size > 0:
        try:
            source.unlink()
        except OSError:
            pass
        return target, "mp4"
    try:
        target.unlink(missing_ok=True)
    except OSError:
        pass
    return source, "sdk_raw"


@router.get("/api/video-archive/cameras/{camera_id}/status")
def recording_status(
    camera_id: int,
    current_user: User = Depends(get_current_user),
):
    del current_user
    with _recording_lock:
        active = _active_recordings.get(camera_id)
        if not active:
            return {"camera_id": camera_id, "recording": False}
        return {
            "camera_id": camera_id,
            "recording": True,
            "started_at": active.started_at.isoformat(),
            "filename": active.source_path.name,
        }


@router.post("/api/video-archive/cameras/{camera_id}/start")
def start_recording(
    request: Request,
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    camera = _camera_or_404(db, camera_id)
    with _recording_lock:
        existing = _active_recordings.get(camera_id)
        if existing:
            return {
                "camera_id": camera_id,
                "recording": True,
                "started_at": existing.started_at.isoformat(),
                "filename": existing.source_path.name,
                "already_running": True,
            }

        started_at = datetime.now(timezone.utc)
        source_path = _camera_directory(camera_id) / f"{started_at.strftime('%Y%m%dT%H%M%SZ')}.ps"
        try:
            recorder = hiksdk_recording_start_sync(
                camera.ip_address,
                camera.port,
                camera.channel,
                camera.username,
                decrypt_camera_password(camera.password),
                source_path,
            )
        except Exception as exc:
            raise HTTPException(502, f"SDK archive recording could not be started: {exc}") from exc

        _active_recordings[camera_id] = ActiveRecording(
            camera_id=camera_id,
            recorder=recorder,
            started_at=started_at,
            source_path=source_path,
        )

    add_audit_log(
        db, current_user, "SDK_ARCHIVE_STARTED", "camera", camera.id,
        f"Started SDK-native archive recording for {camera.name}",
        request.client.host if request.client else None,
    )
    return {"camera_id": camera_id, "recording": True, "started_at": started_at.isoformat(), "filename": source_path.name}


@router.post("/api/video-archive/cameras/{camera_id}/stop")
def stop_recording(
    request: Request,
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _camera_or_404(db, camera_id)
    with _recording_lock:
        active = _active_recordings.pop(camera_id, None)
    if not active:
        raise HTTPException(409, "SDK archive recording is not active")

    source_path = active.recorder.stop() or active.source_path
    final_path, archive_format = _remux_sdk_recording(source_path)
    result = _serialize_file(camera_id, final_path) if final_path.exists() else None

    add_audit_log(
        db, current_user, "SDK_ARCHIVE_STOPPED", "camera", camera_id,
        f"Stopped SDK-native archive recording ({archive_format})",
        request.client.host if request.client else None,
    )
    return {"camera_id": camera_id, "recording": False, "archive": result, "format": archive_format}


@router.get("/api/video-archive/cameras/{camera_id}/segments")
def list_segments(
    camera_id: int,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    del current_user
    limit = min(max(int(limit), 1), 200)
    folder = _camera_directory(camera_id)
    files = [path for path in folder.iterdir() if path.is_file() and path.suffix.lower() in ALLOWED_ARCHIVE_SUFFIXES]
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    with _recording_lock:
        active = _active_recordings.get(camera_id)
    return {
        "items": [_serialize_file(camera_id, path) for path in files[:limit]],
        "recording": bool(active),
        "active_filename": active.source_path.name if active else None,
    }


@router.get("/api/video-archive/cameras/{camera_id}/segments/{filename}/download")
def download_segment(
    camera_id: int,
    filename: str,
    current_user: User = Depends(get_current_user),
):
    del current_user
    path = _archive_path(camera_id, filename)
    media_type = "video/mp4" if path.suffix.lower() == ".mp4" else "application/octet-stream"
    return FileResponse(path, media_type=media_type, filename=path.name)


@router.post("/api/video-archive/cameras/{camera_id}/export")
def export_segments(
    request: Request,
    camera_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    requested = data.get("filenames") or []
    if not isinstance(requested, list) or not requested:
        raise HTTPException(400, "Select at least one MP4 archive segment")
    if len(requested) > 100:
        raise HTTPException(400, "No more than 100 archive segments can be exported at once")

    source_files = [_archive_path(camera_id, str(name)) for name in requested]
    if any(path.suffix.lower() != ".mp4" for path in source_files):
        raise HTTPException(400, "Only converted MP4 archive segments can be exported")

    export_dir = EXPORT_ROOT / f"camera_{camera_id}"
    export_dir.mkdir(parents=True, exist_ok=True)
    export_name = f"export_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.mp4"
    export_path = export_dir / export_name

    if len(source_files) == 1:
        shutil.copy2(source_files[0], export_path)
    else:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise HTTPException(503, "Archive export tool is not available")
        listing_path = None
        try:
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".txt", dir=export_dir, delete=False) as listing:
                listing_path = Path(listing.name)
                for path in source_files:
                    escaped = str(path).replace("'", r"'\''")
                    listing.write(f"file '{escaped}'\n")
            result = subprocess.run(
                [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing_path), "-c", "copy", "-movflags", "+faststart", str(export_path)],
                capture_output=True,
                text=True,
                timeout=180,
                check=False,
            )
            if result.returncode != 0 or not export_path.exists() or export_path.stat().st_size == 0:
                raise HTTPException(502, "The archive segments could not be merged")
        finally:
            if listing_path:
                try:
                    listing_path.unlink(missing_ok=True)
                except OSError:
                    pass

    add_audit_log(
        db, current_user, "SDK_ARCHIVE_EXPORTED", "camera", camera_id,
        f"Exported {len(source_files)} SDK archive segment(s)",
        request.client.host if request.client else None,
    )
    return {
        "filename": export_name,
        "size_bytes": export_path.stat().st_size,
        "download_url": f"/api/video-archive/cameras/{camera_id}/exports/{export_name}/download",
    }


@router.get("/api/video-archive/cameras/{camera_id}/exports/{filename}/download")
def download_export(
    camera_id: int,
    filename: str,
    current_user: User = Depends(get_current_user),
):
    del current_user
    path = _export_path(camera_id, filename)
    return FileResponse(path, media_type="video/mp4", filename=path.name)
