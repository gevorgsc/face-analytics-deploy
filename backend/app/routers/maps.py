"""
maps.py — Floor plan management + camera placement + person path tracking.
"""

import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.auth import get_current_user
from app.models import CameraDevice, FaceEvent, FloorMap, Person, User
from app.utils import MEDIA_DIR, yerevan_day_start_utc
from app.media_security import create_media_url

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/maps", tags=["maps"])

MAP_DIR = os.path.join(MEDIA_DIR, "maps")
os.makedirs(MAP_DIR, exist_ok=True)
MAX_MAP_IMAGE_BYTES = 20 * 1024 * 1024
ALLOWED_MAP_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
ALLOWED_MAP_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _map_out(m: FloorMap) -> dict:
    public_image_path = m.image_path if (m.image_path or "").startswith("/media/") else f"/media/{m.image_path}"
    return {
        "id":         m.id,
        "name":       m.name,
        "image_path": create_media_url(public_image_path),
        "width":      m.width,
        "height":     m.height,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _safe_map_name(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", (name or "floor_map").strip())
    cleaned = cleaned.strip("._-")[:40]
    return cleaned or "floor_map"


def _clean_area_name(name: str | None) -> str:
    cleaned = re.sub(r"\s+", " ", (name or "").strip())
    if not cleaned:
        raise HTTPException(400, "Area name is required")
    if len(cleaned) > 80:
        raise HTTPException(400, "Area name is too long")
    return cleaned


def _map_file_path(image_path: str | None) -> Path | None:
    if not image_path:
        return None
    relative = image_path.strip("/").replace("\\", "/")
    if relative.startswith("media/"):
        relative = relative[len("media/"):]
    full_path = (Path(MEDIA_DIR) / relative).resolve()
    maps_root = Path(MAP_DIR).resolve()
    if full_path != maps_root and maps_root not in full_path.parents:
        raise HTTPException(400, "Invalid map image path")
    # Reject symlinks to prevent TOCTOU attacks
    if full_path.is_symlink():
        raise HTTPException(400, "Invalid map image path")
    return full_path


def _decode_map_image(data: bytes, content_type: str | None, filename: str | None) -> tuple[str, int, int]:
    if not data:
        raise HTTPException(400, "Map image is required")
    if len(data) > MAX_MAP_IMAGE_BYTES:
        raise HTTPException(413, "Map image too large (max 20 MB)")

    ext = (filename or "map.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_MAP_EXTENSIONS:
        raise HTTPException(415, "Only JPG, PNG, or WebP area images are allowed")

    normalized_content_type = (content_type or "").split(";")[0].strip().lower()
    if normalized_content_type and normalized_content_type not in ALLOWED_MAP_CONTENT_TYPES:
        raise HTTPException(415, "Only JPG, PNG, or WebP area images are allowed")

    try:
        import cv2
        import numpy as np
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception as exc:
        logger.warning("Map image decode failed: %s", exc)
        img = None

    if img is None:
        raise HTTPException(400, "Uploaded file is not a readable image")

    height, width = img.shape[:2]
    return ("jpg" if ext == "jpeg" else ext), width, height


def _camera_out(c: CameraDevice) -> dict:
    return {
        "id":       c.id,
        "name":     c.name,
        "location": c.location,
        "ip":       c.ip_address,
        "direction": c.direction,
        "map_id":   c.map_id,
        "map_x":    c.map_x,
        "map_y":    c.map_y,
        "is_active": c.is_active,
    }


# ── Maps CRUD ─────────────────────────────────────────────────────────────────

@router.get("")
def list_maps(db: Session = Depends(get_db), _=Depends(get_current_user)):
    maps = db.query(FloorMap).order_by(FloorMap.created_at.desc()).all()
    # Attach cameras to each map
    result = []
    for m in maps:
        cameras = db.query(CameraDevice).filter(CameraDevice.map_id == m.id).all()
        d = _map_out(m)
        d["cameras"] = [_camera_out(c) for c in cameras]
        result.append(d)
    return result


@router.post("")
async def create_map(
    name:  str        = Form(...),
    image: UploadFile = File(...),
    db:    Session    = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Admin access required")

    data = await image.read()
    ext, width, height = _decode_map_image(data, image.content_type, image.filename)
    safe_name = _safe_map_name(name or image.filename or "floor_map")
    fname = f"map_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:10]}_{safe_name}.{ext}"
    fpath = os.path.join(MAP_DIR, fname)
    with open(fpath, "wb") as f:
        f.write(data)

    floor_map = FloorMap(
        name=(name or safe_name).strip(),
        image_path=f"maps/{fname}",
        width=width,
        height=height,
        created_at=datetime.now(timezone.utc),
    )
    db.add(floor_map)
    db.commit()
    db.refresh(floor_map)
    return _map_out(floor_map)


@router.patch("/{map_id}")
def update_map(
    map_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "operator"):
        raise HTTPException(403, "Not authorized")
    m = db.get(FloorMap, map_id)
    if not m:
        raise HTTPException(404, "Map not found")
    m.name = _clean_area_name(body.get("name"))
    db.commit()
    db.refresh(m)
    return _map_out(m)


@router.delete("/{map_id}")
def delete_map(
    map_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Admin only")
    m = db.get(FloorMap, map_id)
    if not m:
        raise HTTPException(404, "Map not found")
    image_file = _map_file_path(m.image_path)
    # Unlink cameras
    db.query(CameraDevice).filter(CameraDevice.map_id == map_id).update(
        {"map_id": None, "map_x": None, "map_y": None}
    )
    db.delete(m)
    db.commit()
    if image_file and image_file.exists():
        try:
            image_file.unlink()
        except OSError as exc:
            logger.warning("Failed to delete floor map image %s: %s", image_file, exc)
    return {"ok": True}


# ── Camera position on map ────────────────────────────────────────────────────

@router.patch("/camera/{camera_id}/position")
def set_camera_position(
    camera_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set camera x,y position on a map. Body: {map_id, x, y} or {map_id: null} to unlink."""
    if current_user.role not in ("admin", "operator"):
        raise HTTPException(403, "Not authorized")

    cam = db.get(CameraDevice, camera_id)
    if not cam:
        raise HTTPException(404, "Camera not found")

    map_id = body.get("map_id")
    if map_id is None:
        cam.map_id = None
        cam.map_x  = None
        cam.map_y  = None
    else:
        if not db.get(FloorMap, map_id):
            raise HTTPException(404, "Map not found")
        x = float(body.get("x", 0.5))
        y = float(body.get("y", 0.5))
        cam.map_id = map_id
        cam.map_x  = max(0.0, min(1.0, x))
        cam.map_y  = max(0.0, min(1.0, y))

    db.commit()
    return _camera_out(cam)


# ── Person path on map ────────────────────────────────────────────────────────

@router.get("/person-path/{person_id}")
def person_path(
    person_id: int,
    hours: int = 24,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Return the movement path of a person on the map.
    Only includes events from cameras that have map positions.
    """
    # Use naive UTC to match DB storage format
    since = datetime.utcnow() - timedelta(hours=hours)

    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    events = (
        db.query(FaceEvent)
        .filter(
            FaceEvent.source == "face_analytics",
            FaceEvent.person_id == person_id,
        )
        .filter(FaceEvent.created_at >= since)
        .order_by(FaceEvent.created_at.asc())
        .all()
    )

    # Get ALL cameras with map positions — case-insensitive lookup
    all_mapped = db.query(CameraDevice).filter(
        CameraDevice.map_x.isnot(None),
        CameraDevice.map_id.isnot(None),
    ).all()
    cameras_by_id = {c.id: c for c in all_mapped}
    cameras_by_name  = {c.name: c for c in all_mapped}
    cameras_by_lower = {c.name.lower(): c for c in all_mapped}

    def find_camera(event: FaceEvent):
        event_camera_id = getattr(event, "camera_id", None)
        if event_camera_id:
            by_id = cameras_by_id.get(event_camera_id)
            if by_id:
                return by_id
        name = event.camera_name
        if not name:
            return None
        return cameras_by_name.get(name) or cameras_by_lower.get(name.lower())

    path = []
    maps_used: set = set()

    for ev in events:
        cam = find_camera(ev)
        if not cam:
            continue
        from app.utils import _create_media_url
        path.append({
            "event_id":   ev.id,
            "camera":     cam.name,
            "camera_id":  cam.id,
            "map_id":     cam.map_id,
            "x":          cam.map_x,
            "y":          cam.map_y,
            "time":       ev.created_at.isoformat(),
            "confidence": ev.confidence,
            "crop_image": _create_media_url(ev.crop_image_path),
            "image":      _create_media_url(ev.image_path),
        })
        maps_used.add(cam.map_id)

    maps_data = []
    for mid in maps_used:
        m = db.get(FloorMap, mid)
        if m:
            maps_data.append(_map_out(m))

    return {
        "person": {
            "id":          person.id,
            "full_name":   person.full_name,
            "person_type": person.person_type,
            "preview":     person.preview_image,
        },
        "path":       path,
        "maps":       maps_data,
        "hours":      hours,
        "total":      len(path),
        "_debug": {
            "events_in_range":    len(events),
            "mapped_cameras":     len(all_mapped),
            "camera_names_in_events": list({ev.camera_name for ev in events if ev.camera_name}),
            "mapped_camera_names":    [c.name for c in all_mapped],
        },
    }


# ── Person prediction (where will they go next?) ─────────────────────────────

@router.get("/person-prediction/{person_id}")
def person_prediction(
    person_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Predict next camera location based on historical transition patterns.
    Also returns entry point (first camera today) and current location.
    """
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    since_30d  = datetime.utcnow() - timedelta(days=30)
    today_utc  = yerevan_day_start_utc().replace(tzinfo=None)

    events_30d = (
        db.query(FaceEvent)
        .filter(
            FaceEvent.source == "face_analytics",
            FaceEvent.person_id == person_id,
        )
        .filter(FaceEvent.created_at >= since_30d)
        .filter(FaceEvent.camera_name.isnot(None))
        .order_by(FaceEvent.created_at.asc())
        .all()
    )

    if not events_30d:
        return {
            "person_id": person_id,
            "current_camera": None, "last_seen": None,
            "entry_camera": None,   "entry_time": None,
            "predicted_next": None, "prediction_confidence": 0,
            "today_stops": 0,       "today_events": 0,
        }

    # Build camera transition matrix (skip same-camera repeats)
    transitions: dict[str, dict[str, int]] = {}
    for i in range(len(events_30d) - 1):
        frm = events_30d[i].camera_name
        to  = events_30d[i + 1].camera_name
        if frm == to:
            continue
        transitions.setdefault(frm, {})
        transitions[frm][to] = transitions[frm].get(to, 0) + 1

    last_event   = events_30d[-1]
    current_cam  = last_event.camera_name

    # Predict next camera
    predicted_next       = None
    prediction_confidence = 0
    if current_cam in transitions and transitions[current_cam]:
        total          = sum(transitions[current_cam].values())
        predicted_next = max(transitions[current_cam], key=transitions[current_cam].get)
        prediction_confidence = round(transitions[current_cam][predicted_next] / total * 100)

    # Today stats
    today_events = [e for e in events_30d if e.created_at >= today_utc]
    first_today  = today_events[0] if today_events else None

    return {
        "person_id":             person_id,
        "current_camera":        current_cam,
        "last_seen":             last_event.created_at.isoformat(),
        "entry_camera":          first_today.camera_name if first_today else None,
        "entry_time":            first_today.created_at.isoformat() if first_today else None,
        "predicted_next":        predicted_next,
        "prediction_confidence": prediction_confidence,
        "today_stops":           len(set(e.camera_name for e in today_events)),
        "today_events":          len(today_events),
    }


# ── All cameras for a map ─────────────────────────────────────────────────────

@router.get("/{map_id}/cameras")
def map_cameras(
    map_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    m = db.get(FloorMap, map_id)
    if not m:
        raise HTTPException(404, "Map not found")
    cameras = db.query(CameraDevice).filter(CameraDevice.map_id == map_id).all()
    return {
        "map": _map_out(m),
        "cameras": [_camera_out(c) for c in cameras],
    }
