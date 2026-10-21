"""
face_door.py — CRUD for Camera→Door auto-unlock mappings + denial log queries.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import (
    AcsDenialLog, AcsFaceMatchCache, CameraDoorMapping,
    AccessControlDevice, Person, User,
)
from app.utils import add_audit_log

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/acs/face-door", tags=["face_door"])


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _serialize_mapping(m: CameraDoorMapping) -> dict:
    return {
        "id":               m.id,
        "camera_id":        m.camera_id,
        "acs_device_id":    m.acs_device_id,
        "door_no":          m.door_no,
        "allowed_types":    json.loads(m.allowed_types or '["employee","vip"]'),
        "min_confidence":   m.min_confidence,
        "require_face":     bool(m.require_face),
        "cooldown_seconds": m.cooldown_seconds,
        "is_active":        bool(m.is_active),
        "name":             m.name,
        "created_at":       m.created_at,
        "updated_at":       m.updated_at,
    }


def _serialize_denial(d: AcsDenialLog) -> dict:
    return {
        "id":            d.id,
        "device_id":     d.device_id,
        "door_no":       d.door_no,
        "card_number":   d.card_number,
        "person_id":     d.person_id,
        "person_name":   d.person.full_name if d.person else None,
        "denial_reason": d.denial_reason,
        "detail":        d.detail,
        "source":        d.source,
        "created_at":    d.created_at,
    }


# ── Camera→Door Mappings CRUD ─────────────────────────────────────────────────

@router.get("/mappings")
def list_mappings(
    camera_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(CameraDoorMapping)
    if camera_id:
        q = q.filter(CameraDoorMapping.camera_id == camera_id)
    return [_serialize_mapping(m) for m in q.order_by(CameraDoorMapping.id).all()]


@router.post("/mappings")
def create_mapping(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    camera_id     = data.get("camera_id")
    acs_device_id = data.get("acs_device_id")
    if not camera_id or not acs_device_id:
        raise HTTPException(400, "camera_id and acs_device_id are required")

    device = db.get(AccessControlDevice, acs_device_id)
    if not device:
        raise HTTPException(404, "ACS device not found")

    allowed_types = data.get("allowed_types", ["employee", "vip"])

    m = CameraDoorMapping(
        camera_id=camera_id,
        acs_device_id=acs_device_id,
        door_no=data.get("door_no", 1),
        allowed_types=json.dumps(allowed_types),
        min_confidence=data.get("min_confidence", 0.65),
        require_face=1 if data.get("require_face") else 0,
        cooldown_seconds=data.get("cooldown_seconds", 5),
        is_active=1,
        name=data.get("name") or f"Camera {camera_id} → Door {data.get('door_no',1)}",
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    add_audit_log(db, current_user, "FACE_DOOR_MAPPING_CREATED", "camera_door_mapping", m.id,
                  m.name, request.client.host if request.client else None)
    return _serialize_mapping(m)


@router.patch("/mappings/{mapping_id}")
def update_mapping(
    request: Request,
    mapping_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    m = db.get(CameraDoorMapping, mapping_id)
    if not m:
        raise HTTPException(404, "Mapping not found")

    if "door_no"          in data: m.door_no          = data["door_no"]
    if "min_confidence"   in data: m.min_confidence   = data["min_confidence"]
    if "cooldown_seconds" in data: m.cooldown_seconds = data["cooldown_seconds"]
    if "is_active"        in data: m.is_active        = 1 if data["is_active"] else 0
    if "require_face"     in data: m.require_face     = 1 if data["require_face"] else 0
    if "name"             in data: m.name             = data["name"]
    if "allowed_types"    in data:
        m.allowed_types = json.dumps(data["allowed_types"])

    m.updated_at = _utcnow()
    db.commit()
    db.refresh(m)
    add_audit_log(db, current_user, "FACE_DOOR_MAPPING_UPDATED", "camera_door_mapping", m.id,
                  m.name, request.client.host if request.client else None)
    return _serialize_mapping(m)


@router.delete("/mappings/{mapping_id}")
def delete_mapping(
    request: Request,
    mapping_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    m = db.get(CameraDoorMapping, mapping_id)
    if not m:
        raise HTTPException(404, "Mapping not found")
    name = m.name
    db.delete(m)
    db.commit()
    add_audit_log(db, current_user, "FACE_DOOR_MAPPING_DELETED", "camera_door_mapping", mapping_id,
                  name, request.client.host if request.client else None)
    return {"ok": True}


# ── Denial Log ────────────────────────────────────────────────────────────────

@router.get("/denials")
def list_denials(
    device_id:  Optional[int] = Query(None),
    person_id:  Optional[int] = Query(None),
    reason:     Optional[str] = Query(None),
    hours:      int = Query(24, ge=1, le=720),
    limit:      int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cutoff = _utcnow() - timedelta(hours=hours)
    q = (
        db.query(AcsDenialLog)
        .options(joinedload(AcsDenialLog.person))
        .filter(AcsDenialLog.created_at >= cutoff)
        .order_by(AcsDenialLog.created_at.desc())
    )
    if device_id: q = q.filter(AcsDenialLog.device_id == device_id)
    if person_id: q = q.filter(AcsDenialLog.person_id == person_id)
    if reason:    q = q.filter(AcsDenialLog.denial_reason == reason)
    rows = q.limit(limit).all()
    return {
        "total": len(rows),
        "items": [_serialize_denial(d) for d in rows],
    }


@router.get("/denials/stats")
def denial_stats(
    hours: int = Query(24, ge=1, le=720),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Count denials grouped by reason."""
    cutoff = _utcnow() - timedelta(hours=hours)
    rows = (
        db.query(AcsDenialLog.denial_reason,
                 AcsDenialLog.device_id)
        .filter(AcsDenialLog.created_at >= cutoff)
        .all()
    )
    by_reason: dict[str, int] = {}
    by_device: dict[int, int] = {}
    for reason, device_id in rows:
        by_reason[reason] = by_reason.get(reason, 0) + 1
        if device_id:
            by_device[device_id] = by_device.get(device_id, 0) + 1

    return {"by_reason": by_reason, "by_device": by_device, "total": len(rows)}


# ── Recent face match cache (dual-factor status) ──────────────────────────────

@router.get("/face-cache")
def face_cache_status(
    person_id: Optional[int] = Query(None),
    seconds:   int = Query(60),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if person has a recent face match (for dual-factor doors)."""
    cutoff = _utcnow() - timedelta(seconds=seconds)
    q = db.query(AcsFaceMatchCache).filter(AcsFaceMatchCache.matched_at >= cutoff)
    if person_id:
        q = q.filter(AcsFaceMatchCache.person_id == person_id)
    rows = q.order_by(AcsFaceMatchCache.matched_at.desc()).limit(100).all()
    return [
        {
            "person_id": r.person_id,
            "camera_id": r.camera_id,
            "confidence": r.confidence,
            "matched_at": r.matched_at,
        }
        for r in rows
    ]
