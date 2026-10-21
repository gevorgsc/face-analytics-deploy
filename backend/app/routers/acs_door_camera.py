"""Feature 13: Door Camera Auto-Snapshot — capture image on every card swipe."""

import json
import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import (
    AccessControlDevice, AcsAccessEvent, CameraDevice,
    DoorCameraSnapshotMapping, User,
)
from app.utils import utc_now, MEDIA_DIR

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/acs/door-camera", tags=["acs_door_camera"])


def _mapping_out(m: DoorCameraSnapshotMapping) -> dict:
    return {
        "id": m.id, "device_id": m.device_id,
        "device_name": m.device.name if m.device else None,
        "door_no": m.door_no,
        "camera_id": m.camera_id,
        "camera_name": m.camera.name if m.camera else None,
        "trigger_events": json.loads(m.trigger_events or "[]"),
        "is_active": bool(m.is_active), "created_at": m.created_at,
    }


# ── Mappings CRUD ─────────────────────────────────────────────────────────────

@router.get("/mappings")
def list_mappings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    mappings = db.query(DoorCameraSnapshotMapping).options(
        joinedload(DoorCameraSnapshotMapping.device),
        joinedload(DoorCameraSnapshotMapping.camera),
    ).all()
    return [_mapping_out(m) for m in mappings]


@router.post("/mappings")
def create_mapping(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    for field in ("device_id", "door_no", "camera_id"):
        if not data.get(field):
            raise HTTPException(400, f"{field} is required")
    if not db.get(AccessControlDevice, data["device_id"]):
        raise HTTPException(404, "ACS device not found")
    if not db.get(CameraDevice, data["camera_id"]):
        raise HTTPException(404, "Camera not found")
    mapping = DoorCameraSnapshotMapping(
        device_id=int(data["device_id"]),
        door_no=int(data["door_no"]),
        camera_id=int(data["camera_id"]),
        trigger_events=json.dumps(data.get("trigger_events") or ["access_granted", "access_denied"]),
        is_active=1 if data.get("is_active", True) else 0,
    )
    db.add(mapping); db.commit()
    mapping = db.query(DoorCameraSnapshotMapping).options(
        joinedload(DoorCameraSnapshotMapping.device),
        joinedload(DoorCameraSnapshotMapping.camera),
    ).filter(DoorCameraSnapshotMapping.id == mapping.id).first()
    return _mapping_out(mapping)


@router.patch("/mappings/{mapping_id}")
def update_mapping(
    mapping_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    m = db.query(DoorCameraSnapshotMapping).options(
        joinedload(DoorCameraSnapshotMapping.device),
        joinedload(DoorCameraSnapshotMapping.camera),
    ).filter(DoorCameraSnapshotMapping.id == mapping_id).first()
    if not m:
        raise HTTPException(404, "Mapping not found")
    if "trigger_events" in data:
        m.trigger_events = json.dumps(data["trigger_events"])
    if "is_active" in data:
        m.is_active = 1 if data["is_active"] else 0
    db.commit(); db.refresh(m)
    return _mapping_out(m)


@router.delete("/mappings/{mapping_id}")
def delete_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    m = db.get(DoorCameraSnapshotMapping, mapping_id)
    if not m:
        raise HTTPException(404, "Mapping not found")
    db.delete(m); db.commit()
    return {"ok": True}


# ── Manual snapshot trigger ────────────────────────────────────────────────────

@router.post("/snapshot/{mapping_id}")
async def trigger_snapshot(
    mapping_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """Manually trigger a snapshot from the linked camera."""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    m = db.query(DoorCameraSnapshotMapping).options(
        joinedload(DoorCameraSnapshotMapping.device),
        joinedload(DoorCameraSnapshotMapping.camera),
    ).filter(DoorCameraSnapshotMapping.id == mapping_id).first()
    if not m or not m.is_active:
        raise HTTPException(404, "Active mapping not found")

    camera = m.camera
    if not camera:
        raise HTTPException(404, "Camera not found")

    try:
        from app.camera_utils import capture_snapshot_bytes
        _executor = ThreadPoolExecutor(max_workers=2)
        loop   = asyncio.get_running_loop()
        image  = await loop.run_in_executor(_executor, capture_snapshot_bytes, camera)
        if image:
            ts   = utc_now().strftime("%Y%m%d_%H%M%S")
            path = os.path.join(MEDIA_DIR, f"door_snap_{mapping_id}_{ts}.jpg")
            with open(path, "wb") as f:
                f.write(image)
            return {"ok": True, "image_path": os.path.basename(path)}
    except Exception as exc:
        logger.warning("Door camera snapshot failed: %s", exc)

    return {"ok": False, "message": "Snapshot capture failed"}


# ── Event-triggered snapshot (called by ingest pipeline) ─────────────────────

def on_acs_event(db: Session, event: AcsAccessEvent) -> None:
    """Called during event ingest to take snapshots from linked cameras."""
    if not event.device_id or not event.door_no:
        return
    mappings = db.query(DoorCameraSnapshotMapping).filter(
        DoorCameraSnapshotMapping.device_id == event.device_id,
        DoorCameraSnapshotMapping.door_no == event.door_no,
        DoorCameraSnapshotMapping.is_active == 1,
    ).all()
    for m in mappings:
        allowed = json.loads(m.trigger_events or "[]")
        if event.event_type not in allowed:
            continue
        try:
            from app.camera_utils import capture_snapshot_bytes
            image = capture_snapshot_bytes(m.camera)
            if image:
                ts   = utc_now().strftime("%Y%m%d_%H%M%S")
                path = os.path.join(MEDIA_DIR, f"door_snap_ev{event.id}_{ts}.jpg")
                with open(path, "wb") as f:
                    f.write(image)
                logger.info("Auto-snapshot saved for event %d: %s", event.id, path)
        except Exception as exc:
            logger.debug("Auto-snapshot error for event %d: %s", event.id, exc)
