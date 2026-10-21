"""Feature 4: Tailgating Detection — detect multiple people per card swipe."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import (
    AccessControlDevice, CameraDevice, TailgatingConfig,
    TailgatingEvent, User,
)
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/tailgating", tags=["acs_tailgating"])


def _cfg_out(c: TailgatingConfig) -> dict:
    return {
        "id": c.id, "device_id": c.device_id,
        "device_name": c.device.name if c.device else None,
        "door_no": c.door_no,
        "camera_id": c.camera_id,
        "camera_name": c.camera.name if c.camera else None,
        "detection_window_seconds": c.detection_window_seconds,
        "is_active": bool(c.is_active), "created_at": c.created_at,
    }


def _event_out(e: TailgatingEvent) -> dict:
    return {
        "id": e.id, "device_id": e.device_id, "door_no": e.door_no,
        "authorized_person_id": e.authorized_person_id,
        "authorized_person_name": e.authorized_person.full_name if e.authorized_person else None,
        "extra_face_count": e.extra_face_count,
        "event_image_path": e.event_image_path,
        "is_resolved": bool(e.is_resolved),
        "resolved_at": e.resolved_at, "resolved_note": e.resolved_note,
        "created_at": e.created_at,
    }


# ── Config CRUD ───────────────────────────────────────────────────────────────

@router.get("/configs")
def list_configs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cfgs = db.query(TailgatingConfig).options(
        joinedload(TailgatingConfig.device),
        joinedload(TailgatingConfig.camera),
    ).all()
    return [_cfg_out(c) for c in cfgs]


@router.post("/configs")
def create_config(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not data.get("device_id") or not data.get("door_no"):
        raise HTTPException(400, "device_id and door_no required")
    device = db.get(AccessControlDevice, data["device_id"])
    if not device:
        raise HTTPException(404, "ACS device not found")
    camera_id = data.get("camera_id")
    if camera_id and not db.get(CameraDevice, camera_id):
        raise HTTPException(404, "Camera not found")
    cfg = TailgatingConfig(
        device_id=data["device_id"], door_no=int(data["door_no"]),
        camera_id=camera_id,
        detection_window_seconds=int(data.get("detection_window_seconds") or 5),
        is_active=1 if data.get("is_active", True) else 0,
    )
    db.add(cfg); db.commit(); db.refresh(cfg)
    cfg.device = device
    return _cfg_out(cfg)


@router.patch("/configs/{cfg_id}")
def update_config(
    cfg_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cfg = db.query(TailgatingConfig).options(
        joinedload(TailgatingConfig.device),
        joinedload(TailgatingConfig.camera),
    ).filter(TailgatingConfig.id == cfg_id).first()
    if not cfg:
        raise HTTPException(404, "Config not found")
    if "camera_id" in data:
        cfg.camera_id = data["camera_id"]
    if "detection_window_seconds" in data:
        cfg.detection_window_seconds = int(data["detection_window_seconds"])
    if "is_active" in data:
        cfg.is_active = 1 if data["is_active"] else 0
    db.commit(); db.refresh(cfg)
    return _cfg_out(cfg)


@router.delete("/configs/{cfg_id}")
def delete_config(
    cfg_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cfg = db.get(TailgatingConfig, cfg_id)
    if not cfg:
        raise HTTPException(404, "Config not found")
    db.delete(cfg); db.commit()
    return {"ok": True}


# ── Events log ────────────────────────────────────────────────────────────────

@router.get("/events")
def list_events(
    limit: int = Query(100, ge=1, le=500),
    unresolved_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(TailgatingEvent).options(
        joinedload(TailgatingEvent.authorized_person)
    ).order_by(TailgatingEvent.created_at.desc())
    if unresolved_only:
        q = q.filter(TailgatingEvent.is_resolved == 0)
    return [_event_out(e) for e in q.limit(limit).all()]


@router.post("/events")
def report_event(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """Manually report or auto-report a tailgating incident."""
    if not data.get("device_id"):
        raise HTTPException(400, "device_id required")
    ev = TailgatingEvent(
        device_id=data["device_id"],
        door_no=data.get("door_no"),
        authorized_person_id=data.get("authorized_person_id"),
        extra_face_count=int(data.get("extra_face_count") or 1),
        event_image_path=data.get("event_image_path"),
        created_at=utc_now(),
    )
    db.add(ev); db.commit(); db.refresh(ev)
    return _event_out(ev)


@router.patch("/events/{event_id}/resolve")
def resolve_event(
    event_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    ev = db.query(TailgatingEvent).options(
        joinedload(TailgatingEvent.authorized_person)
    ).filter(TailgatingEvent.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Event not found")
    ev.is_resolved  = 1
    ev.resolved_at  = utc_now()
    ev.resolved_note = data.get("note") or ""
    db.commit(); db.refresh(ev)
    return _event_out(ev)
