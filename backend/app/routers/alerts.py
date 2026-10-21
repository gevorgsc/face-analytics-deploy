"""Alert configuration router - manage who gets notified and when."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User, AlertConfig, AlertEvent
from app.auth import require_admin, get_current_user
from app.utils import add_audit_log, utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("/configs")
def list_alert_configs(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    configs = db.query(AlertConfig).order_by(AlertConfig.id).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "is_active": c.is_active,
            "trigger_person_type": c.trigger_person_type,
            "min_confidence": c.min_confidence,
            "channels": json.loads(c.channels or "[]"),
            "cooldown_seconds": c.cooldown_seconds,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
        }
        for c in configs
    ]


@router.post("/configs")
def create_alert_config(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Alert name is required")

    trigger = (data.get("trigger_person_type") or "blacklist").lower()
    if trigger not in {"blacklist", "vip", "employee", "unknown", "any"}:
        raise HTTPException(400, "trigger_person_type must be: blacklist, vip, employee, unknown, any")

    channels = data.get("channels") or []
    if not isinstance(channels, list):
        raise HTTPException(400, "channels must be a list")

    config = AlertConfig(
        name=name,
        is_active=1 if data.get("is_active", True) else 0,
        trigger_person_type=trigger,
        min_confidence=float(data.get("min_confidence") or 0.0),
        channels=json.dumps(channels),
        cooldown_seconds=int(data.get("cooldown_seconds") or 300),
    )
    db.add(config)
    db.commit()
    db.refresh(config)

    add_audit_log(db, current_user, "ALERT_CONFIG_CREATED", "alert_config", config.id, f"Created: {config.name}",
                  request.client.host if request.client else None)
    return {"ok": True, "id": config.id}


@router.patch("/configs/{config_id}")
def update_alert_config(
    request: Request,
    config_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    config = db.get(AlertConfig, config_id)
    if not config:
        raise HTTPException(404, "Alert config not found")

    if "name" in data:
        config.name = (data["name"] or "").strip()
    if "is_active" in data:
        config.is_active = 1 if data["is_active"] else 0
    if "trigger_person_type" in data:
        trigger = (data["trigger_person_type"] or "").lower()
        if trigger not in {"blacklist", "vip", "employee", "unknown", "any"}:
            raise HTTPException(400, "trigger_person_type must be: blacklist, vip, employee, unknown, any")
        config.trigger_person_type = trigger
    if "min_confidence" in data:
        config.min_confidence = float(data["min_confidence"])
    if "cooldown_seconds" in data:
        config.cooldown_seconds = int(data["cooldown_seconds"])
    if "channels" in data:
        config.channels = json.dumps(data["channels"])
    config.updated_at = utc_now()

    db.commit()
    add_audit_log(db, current_user, "ALERT_CONFIG_UPDATED", "alert_config", config_id, f"Updated: {config.name}",
                  request.client.host if request.client else None)
    return {"ok": True}


@router.delete("/configs/{config_id}")
def delete_alert_config(
    request: Request,
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    config = db.get(AlertConfig, config_id)
    if not config:
        raise HTTPException(404, "Alert config not found")

    config_name = config.name
    db.delete(config)
    db.commit()

    add_audit_log(db, current_user, "ALERT_CONFIG_DELETED", "alert_config", config_id, f"Deleted: {config_name}",
                  request.client.host if request.client else None)
    return {"ok": True}


@router.post("/configs/{config_id}/test")
def test_alert_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Send a test alert through all configured channels."""
    from app.alert_engine import dispatch_alert

    config = db.get(AlertConfig, config_id)
    if not config:
        raise HTTPException(404, "Alert config not found")

    test_event = {
        "event_id": 0,
        "person_id": 0,
        "person_name": "Test Person",
        "person_type": config.trigger_person_type,
        "camera_name": "Test Camera",
        "confidence": 0.95,
        "created_at": str(utc_now()),
        "image_path": None,
        "crop_image_path": None,
        "original_image_path": None,
    }

    dispatch_alert(config, test_event, db)
    return {"ok": True, "message": "Test alert dispatched"}


@router.get("/history")
def alert_history(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    events = (db.query(AlertEvent)
              .order_by(AlertEvent.created_at.desc())
              .limit(min(limit, 500))
              .all())
    return [
        {
            "id": e.id,
            "alert_config_id": e.alert_config_id,
            "face_event_id": e.face_event_id,
            "person_id": e.person_id,
            "person_type": e.person_type,
            "channel_type": e.channel_type,
            "status": e.status,
            "error_message": e.error_message,
            "created_at": e.created_at,
        }
        for e in events
    ]
