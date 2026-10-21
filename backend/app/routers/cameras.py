"""Camera management router - CRUD, live stream, snapshot, diagnostics."""

import asyncio
import base64
import hashlib
import hmac
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from urllib.parse import urlencode

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.auth import (
    ALGORITHM,
    SECRET_KEY,
    get_current_user,
    require_admin,
)
from app.camera_pool import camera_pool
from app.camera_utils import (
    camera_to_dict as serialize_camera,
)
from app.camera_utils import (
    validate_camera_ip,
    validate_direction,
    validate_port,
)
from app.db import get_db
from app.models import CameraDevice, User
from app.secrets import decrypt_camera_password, encrypt_camera_password
from app.utils import (
    add_audit_log,
    diff_snapshot,
    model_snapshot,
    sign_media_fields,
    utc_now,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["cameras"])

_stream_executor = ThreadPoolExecutor(max_workers=20)
SNAPSHOT_MODES = {"onvif", "hiksdk"}
DEFAULT_SNAPSHOT_MODE = "hiksdk"
STREAM_URL_TTL_SECONDS = 60


def _stream_payload(camera_id: int, stream_type: Optional[int], quality: Optional[int], fps: Optional[float], exp: int) -> str:
    return f"/api/cameras/{camera_id}/stream|{stream_type or ''}|{quality or ''}|{fps or ''}|{exp}"


def _sign_stream_url(camera_id: int, stream_type: Optional[int], quality: Optional[int], fps: Optional[float], exp: int) -> str:
    digest = hmac.new(
        SECRET_KEY.encode("utf-8"),
        _stream_payload(camera_id, stream_type, quality, fps, exp).encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def _verify_stream_signature(
    camera_id: int,
    stream_type: Optional[int],
    quality: Optional[int],
    fps: Optional[float],
    exp: Optional[int],
    sig: Optional[str],
) -> bool:
    if not exp or not sig or exp < int(time.time()):
        return False
    expected = _sign_stream_url(camera_id, stream_type, quality, fps, exp)
    return hmac.compare_digest(expected, sig)


def camera_to_dict(camera: CameraDevice) -> dict:
    return serialize_camera(camera, signer=sign_media_fields)


@router.get("/api/cameras")
def list_cameras(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cameras = db.query(CameraDevice).order_by(CameraDevice.id.desc()).all()
    return [camera_to_dict(c) for c in cameras]


@router.post("/api/cameras")
def create_camera(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    name = (data.get("name") or "").strip()
    ip_address = validate_camera_ip(data.get("ip_address"))

    if not name or not ip_address:
        raise HTTPException(400, "Camera name and IP address are required")

    snapshot_mode = (data.get("snapshot_mode") or DEFAULT_SNAPSHOT_MODE).strip().lower()
    if snapshot_mode not in SNAPSHOT_MODES:
        snapshot_mode = DEFAULT_SNAPSHOT_MODE

    port = validate_port(data.get("port") or (8000 if snapshot_mode == "hiksdk" else 80))
    channel = 101
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    direction    = validate_direction(data.get("direction"))
    http_port_val = int(data.get("http_port") or 80)

    camera = CameraDevice(
        name=name,
        ip_address=ip_address,
        port=port,
        username=username,
        password=encrypt_camera_password(password),
        channel=channel,
        rtsp_url=None,
        location=(data.get("location") or "").strip(),
        is_active=1 if data.get("is_active", True) else 0,
        ai_enabled=1 if data.get("ai_enabled", True) else 0,
        live_enabled=1 if data.get("live_enabled", True) else 0,
        direction=direction,
        snapshot_mode=snapshot_mode,
        http_port=http_port_val,
        notes=data.get("notes") or "",
    )

    db.add(camera)
    db.commit()
    db.refresh(camera)

    add_audit_log(
        db, current_user, "CAMERA_CREATED", "camera", camera.id,
        f"Created camera: {camera.name} / {camera.ip_address}",
        request.client.host if request.client else None,
    )

    return camera_to_dict(camera)


@router.patch("/api/cameras/{camera_id}")
def update_camera(
    request: Request,
    camera_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    camera = db.get(CameraDevice, camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")

    before = model_snapshot(camera, [
        "name", "ip_address", "port", "username", "password", "channel",
        "location", "is_active", "ai_enabled", "live_enabled",
        "direction", "snapshot_mode", "http_port", "notes",
    ])

    for field in ["name", "ip_address", "username", "location", "notes"]:
        if field in data:
            setattr(
                camera, field,
                (data.get(field) or "").strip() if field != "notes" else data.get(field) or "",
            )

    if "ip_address" in data:
        camera.ip_address = validate_camera_ip(data.get("ip_address"))

    if "password" in data and data.get("password"):
        camera.password = encrypt_camera_password(data.get("password"))

    if "port" in data:
        camera.port = validate_port(data.get("port"))

    if "channel" in data:
        camera.channel = int(data.get("channel") or 101)

    if "direction" in data:
        camera.direction = validate_direction(data.get("direction"))

    if "snapshot_mode" in data:
        sm = (data.get("snapshot_mode") or DEFAULT_SNAPSHOT_MODE).strip().lower()
        camera.snapshot_mode = sm if sm in SNAPSHOT_MODES else DEFAULT_SNAPSHOT_MODE

    if "http_port" in data:
        camera.http_port = int(data.get("http_port") or 80)

    for field in ["is_active", "ai_enabled", "live_enabled"]:
        if field in data:
            setattr(camera, field, 1 if data.get(field) else 0)

    camera.updated_at = utc_now()
    db.commit()
    db.refresh(camera)

    after = model_snapshot(camera, list(before.keys()))
    changes = diff_snapshot(before, after, redact={"password"})
    add_audit_log(
        db, current_user, "CAMERA_UPDATED", "camera", camera.id,
        __import__("json").dumps({"camera": f"{camera.name} / {camera.ip_address}", "changes": changes}, default=str),
        request.client.host if request.client else None,
    )

    camera_pool.stop_worker(camera.id)

    return camera_to_dict(camera)


@router.delete("/api/cameras/{camera_id}")
def delete_camera(
    request: Request,
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    camera = db.get(CameraDevice, camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")

    deleted_name = camera.name
    deleted_ip = camera.ip_address
    db.delete(camera)
    db.commit()

    camera_pool.stop_worker(camera_id)

    add_audit_log(
        db, current_user, "CAMERA_DELETED", "camera", camera_id,
        f"Deleted camera: {deleted_name} / {deleted_ip}",
        request.client.host if request.client else None,
    )

    return {"ok": True}


@router.get("/api/cameras/{camera_id}/stream-url")
def camera_stream_url(
    camera_id: int,
    stream_type: Optional[int] = Query(None, description="0=main, 1=sub, 2=third"),
    quality: Optional[int] = Query(None, ge=30, le=95, description="JPEG quality 30-95"),
    fps: Optional[float] = Query(None, ge=1.0, le=30.0, description="Max FPS cap"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    camera = db.get(CameraDevice, camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")
    if not camera.is_active or not camera.live_enabled:
        raise HTTPException(403, "Live stream disabled for this camera")

    exp = int(time.time()) + STREAM_URL_TTL_SECONDS
    params = {
        "exp": exp,
        "sig": _sign_stream_url(camera_id, stream_type, quality, fps, exp),
    }
    if stream_type is not None:
        params["stream_type"] = stream_type
    if quality is not None:
        params["quality"] = quality
    if fps is not None:
        params["fps"] = fps
    return {"url": f"/api/cameras/{camera_id}/stream?{urlencode(params)}", "expires_at": exp}


@router.get("/api/cameras/{camera_id}/stream")
async def camera_stream(
    camera_id: int,
    request: Request,
    token: Optional[str] = Query(None),
    exp: Optional[int] = Query(None),
    sig: Optional[str] = Query(None),
    stream_type: Optional[int] = Query(None, description="0=main, 1=sub, 2=third"),
    quality: Optional[int]    = Query(None, ge=30, le=95, description="JPEG quality 30-95"),
    fps: Optional[float]      = Query(None, ge=1.0, le=30.0, description="Max FPS cap"),
    db: Session = Depends(get_db),
):
    if not _verify_stream_signature(camera_id, stream_type, quality, fps, exp, sig):
        bearer = request.headers.get("Authorization", "")
        raw = token or (bearer[7:] if bearer.startswith("Bearer ") else None)
        if not raw:
            raise HTTPException(401, "Not authenticated")
        try:
            payload = jwt.decode(raw, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(401, "Invalid token")
        except JWTError:
            raise HTTPException(401, "Invalid token")
        user = db.query(User).filter(User.id == int(user_id)).first()
        if not user or not user.is_active:
            raise HTTPException(401, "Inactive or unknown user")

    camera = db.get(CameraDevice, camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")
    if not camera.is_active or not camera.live_enabled:
        raise HTTPException(403, "Live stream disabled for this camera")

    mode = camera.snapshot_mode or DEFAULT_SNAPSHOT_MODE

    if mode == "hiksdk":
        from app.hiksdk_client import hiksdk_h264_mjpeg_generator
        from app.secrets import decrypt_camera_password as _dec
        base_channel = camera.channel or 101
        # Override stream type via query param: 0=main, 1=sub, 2=third
        if stream_type is not None and stream_type in (0, 1, 2):
            chan_base = max(1, base_channel // 100) if base_channel >= 100 else max(1, base_channel)
            base_channel = chan_base * 100 + stream_type + 1
        gen = hiksdk_h264_mjpeg_generator(
            camera.ip_address,
            camera.port or 8000,
            base_channel,
            camera.username or "",
            _dec(camera.password or ""),
            jpeg_quality=quality or 80,
            max_fps=fps or 0.0,
        )
        return StreamingResponse(
            gen,
            media_type="multipart/x-mixed-replace; boundary=frame",
            headers={"Cache-Control": "no-cache, no-store"},
        )

    raise HTTPException(400, "Live streaming is available only for Hikvision SDK cameras")


@router.get("/api/cameras/{camera_id}/snapshot")
async def camera_snapshot(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    camera = db.get(CameraDevice, camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")
    if not camera.is_active or not camera.live_enabled:
        raise HTTPException(403, "Live stream disabled for this camera")

    mode = camera.snapshot_mode or DEFAULT_SNAPSHOT_MODE
    loop = asyncio.get_running_loop()

    # -- ONVIF (HTTP SOAP, no RTSP) --------------------------------------------
    if mode == "onvif":
        from app.onvif_client import onvif_snapshot_sync
        from app.secrets import decrypt_camera_password as _dec
        try:
            jpeg = await loop.run_in_executor(
                _stream_executor,
                onvif_snapshot_sync,
                camera.ip_address,
                camera.http_port or 80,
                camera.username or "",
                _dec(camera.password or ""),
            )
            return Response(content=jpeg, media_type="image/jpeg")
        except Exception as e:
            logger.warning("ONVIF snapshot failed for camera %d: %s", camera_id, e)
            raise HTTPException(503, f"ONVIF snapshot failed: {e}")

    # -- Hikvision HCNetSDK private protocol (SDK port, usually 8000) ----------
    if mode == "hiksdk":
        from app.hiksdk_client import hiksdk_snapshot_sync
        from app.secrets import decrypt_camera_password as _dec
        try:
            jpeg = await loop.run_in_executor(
                _stream_executor,
                hiksdk_snapshot_sync,
                camera.ip_address,
                camera.port or 8000,
                camera.channel or 101,
                camera.username or "",
                _dec(camera.password or ""),
            )
            return Response(content=jpeg, media_type="image/jpeg")
        except Exception as e:
            logger.warning("HCNetSDK snapshot failed for camera %d: %s", camera_id, e)
            raise HTTPException(503, f"HCNetSDK snapshot failed: {e}")

    raise HTTPException(400, "Unsupported camera snapshot mode")


@router.get("/api/cameras/{camera_id}/diagnostics")
async def camera_diagnostics(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    camera = db.get(CameraDevice, camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")

    mode = camera.snapshot_mode or DEFAULT_SNAPSHOT_MODE
    loop = asyncio.get_running_loop()

    if mode == "onvif":
        from app.onvif_client import get_onvif_snapshot_uri_sync
        from app.secrets import decrypt_camera_password as _dec
        try:
            uri = await loop.run_in_executor(
                _stream_executor, get_onvif_snapshot_uri_sync,
                camera.ip_address, camera.http_port or 80,
                camera.username or "", _dec(camera.password or ""),
            )
            return {"camera_id": camera.id, "mode": "onvif", "ok": bool(uri),
                    "snapshot_uri": uri, "hint": "ONVIF OK" if uri else "ONVIF: no snapshot URI found"}
        except Exception as e:
            return {"camera_id": camera.id, "mode": "onvif", "ok": False,
                    "hint": f"ONVIF failed: {e}"}

    if mode == "hiksdk":
        from app.hiksdk_client import hiksdk_diagnostics_sync
        from app.secrets import decrypt_camera_password as _dec
        try:
            result = await loop.run_in_executor(
                _stream_executor,
                hiksdk_diagnostics_sync,
                camera.ip_address,
                camera.port or 8000,
                camera.channel or 101,
                camera.username or "",
                _dec(camera.password or ""),
            )
            return {
                "camera_id": camera.id,
                "mode": "hiksdk",
                "ok": True,
                "hint": "HCNetSDK snapshot OK",
                **result,
            }
        except Exception as e:
            return {"camera_id": camera.id, "mode": "hiksdk", "ok": False,
                    "hint": f"HCNetSDK failed: {e}"}

    return {"camera_id": camera.id, "mode": mode, "ok": False, "hint": "Unsupported camera mode"}


# -- Camera health status ------------------------------------------------------

@router.get("/api/cameras/health-status")
def cameras_health_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns online/offline status for every active camera."""
    from app.camera_pool import camera_pool

    cameras = db.query(CameraDevice).order_by(CameraDevice.id).all()
    worker_status = camera_pool.status()
    result = []
    for cam in cameras:
        mode = cam.snapshot_mode or DEFAULT_SNAPSHOT_MODE
        online = False
        hint = ""
        runtime = worker_status.get(cam.id)

        if not cam.is_active or not cam.live_enabled:
            hint = "Camera disabled"
        elif runtime:
            online = bool(runtime.get("connected")) and (
                runtime.get("frame_age_seconds") is None
                or runtime.get("frame_age_seconds") <= 5
            )
            hint = "Live RTSP worker connected" if online else (
                runtime.get("last_error") or "RTSP worker reconnecting"
            )
        elif mode == "onvif":
            try:
                from app.onvif_client import get_onvif_snapshot_uri_sync
                uri = get_onvif_snapshot_uri_sync(
                    cam.ip_address,
                    cam.http_port or 80,
                    cam.username or "",
                    decrypt_camera_password(cam.password or ""),
                )
                online = bool(uri)
                hint = "ONVIF snapshot URI OK" if uri else "ONVIF snapshot URI missing"
            except Exception as e:
                hint = f"ONVIF failed: {e}"
        elif mode == "hiksdk":
            try:
                from app.hiksdk_client import hiksdk_diagnostics_sync
                hiksdk_diagnostics_sync(
                    cam.ip_address,
                    cam.port or 8000,
                    cam.channel or 101,
                    cam.username or "",
                    decrypt_camera_password(cam.password or ""),
                )
                online = True
                hint = "HCNetSDK snapshot OK"
            except Exception as e:
                hint = f"HCNetSDK failed: {e}"

        result.append({
            "id":         cam.id,
            "name":       cam.name,
            "ip_address": cam.ip_address,
            "location":   cam.location,
            "is_active":  bool(cam.is_active),
            "live_enabled": bool(cam.live_enabled),
            "online":     online,
            "mode":       mode,
            "hint":       hint,
            "direction":  cam.direction or "both",
            "runtime":    runtime,
        })
    return result


# -- Annotated snapshot (face bounding boxes) ---------------------------------

_annotated_cache: dict = {}   # camera_id в†’ (timestamp, jpeg_bytes)
_ANNOTATE_CACHE_TTL = 2.0     # seconds

@router.get("/api/cameras/{camera_id}/annotated-snapshot")
async def camera_annotated_snapshot(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns the latest frame with face bounding boxes drawn."""
    import time as _time
    camera = db.get(CameraDevice, camera_id)
    if not camera or not camera.is_active or not camera.live_enabled:
        raise HTTPException(404, "Camera not found or inactive")

    # Serve from short-lived cache to avoid running detection on every request
    cached = _annotated_cache.get(camera_id)
    if cached and (_time.monotonic() - cached[0]) < _ANNOTATE_CACHE_TTL:
        return Response(content=cached[1], media_type="image/jpeg")

    loop = asyncio.get_running_loop()
    mode = camera.snapshot_mode or DEFAULT_SNAPSHOT_MODE
    try:
        if mode == "hiksdk":
            from app.hiksdk_client import hiksdk_snapshot_sync
            jpeg_bytes = await loop.run_in_executor(
                _stream_executor,
                hiksdk_snapshot_sync,
                camera.ip_address,
                camera.port or 8000,
                camera.channel or 101,
                camera.username or "",
                decrypt_camera_password(camera.password or ""),
            )
        elif mode == "onvif":
            from app.onvif_client import onvif_snapshot_sync
            jpeg_bytes = await loop.run_in_executor(
                _stream_executor,
                onvif_snapshot_sync,
                camera.ip_address,
                camera.http_port or 80,
                camera.username or "",
                decrypt_camera_password(camera.password or ""),
            )
        else:
            raise RuntimeError("Unsupported camera mode")
        frame = cv2.imdecode(np.frombuffer(jpeg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise RuntimeError("Snapshot decode failed")
    except Exception as e:
        raise HTTPException(503, f"Cannot read camera frame: {e}")

    # Run face detection + draw boxes
    try:
        from app.face_engine import face_app
        faces = face_app.get(frame)
        annotated = frame.copy()
        for face in faces:
            box = face.bbox.astype(int)
            x1, y1, x2, y2 = box
            # Color: green box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 220, 80), 2)
            # Confidence label
            conf = getattr(face, "det_score", None)
            if conf is not None:
                label = f"{conf:.0%}"
                cv2.putText(annotated, label, (x1, max(y1 - 6, 12)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 80), 1, cv2.LINE_AA)
        # Face count overlay
        cv2.putText(annotated, f"Faces: {len(faces)}", (8, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
    except Exception as _e:
        logger.warning("Annotation failed for camera %d: %s", camera_id, _e)
        annotated = frame

    _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
    jpeg = buf.tobytes()
    import time as _time2
    _annotated_cache[camera_id] = (_time2.monotonic(), jpeg)
    return Response(content=jpeg, media_type="image/jpeg")
