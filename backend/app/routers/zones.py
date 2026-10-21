"""Camera zones router - group cameras into logical areas."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User, CameraZone, CameraZoneMapping, CameraDevice
from app.auth import require_admin, require_operator_or_admin, get_current_user
from app.utils import add_audit_log, utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/zones", tags=["zones"])


@router.get("")
def list_zones(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    zones = db.query(CameraZone).order_by(CameraZone.id).all()
    if not zones:
        return []

    # Batch-load all mappings and cameras in 2 queries instead of 2*N
    zone_ids = [z.id for z in zones]
    all_mappings = db.query(CameraZoneMapping).filter(CameraZoneMapping.zone_id.in_(zone_ids)).all()

    camera_ids = list({m.camera_id for m in all_mappings})
    cameras_by_id = {}
    if camera_ids:
        for c in db.query(CameraDevice).filter(CameraDevice.id.in_(camera_ids)).all():
            cameras_by_id[c.id] = c

    mappings_by_zone: dict[int, list] = {}
    for m in all_mappings:
        mappings_by_zone.setdefault(m.zone_id, []).append(m)

    result = []
    for zone in zones:
        zone_cameras = [
            cameras_by_id[m.camera_id]
            for m in mappings_by_zone.get(zone.id, [])
            if m.camera_id in cameras_by_id
        ]
        result.append({
            "id": zone.id,
            "name": zone.name,
            "description": zone.description,
            "color": zone.color,
            "created_at": zone.created_at,
            "cameras": [
                {"id": c.id, "name": c.name, "ip_address": c.ip_address, "location": c.location}
                for c in zone_cameras
            ],
        })
    return result


@router.post("")
def create_zone(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Zone name is required")

    zone = CameraZone(
        name=name,
        description=(data.get("description") or "").strip(),
        color=data.get("color") or "#3B82F6",
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)

    camera_ids = data.get("camera_ids") or []
    for cid in camera_ids:
        camera = db.get(CameraDevice, cid)
        if camera:
            mapping = CameraZoneMapping(zone_id=zone.id, camera_id=cid)
            db.add(mapping)
    db.commit()

    add_audit_log(db, current_user, "ZONE_CREATED", "zone", zone.id, f"Zone: {zone.name}",
                  request.client.host if request.client else None)
    return {"ok": True, "id": zone.id, "name": zone.name}


@router.patch("/{zone_id}")
def update_zone(
    request: Request,
    zone_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    zone = db.get(CameraZone, zone_id)
    if not zone:
        raise HTTPException(404, "Zone not found")

    if "name" in data:
        zone.name = (data["name"] or "").strip()
    if "description" in data:
        zone.description = data["description"] or ""
    if "color" in data:
        zone.color = data["color"] or "#3B82F6"

    if "camera_ids" in data:
        db.query(CameraZoneMapping).filter(CameraZoneMapping.zone_id == zone_id).delete()
        for cid in (data.get("camera_ids") or []):
            camera = db.get(CameraDevice, cid)
            if camera:
                db.add(CameraZoneMapping(zone_id=zone_id, camera_id=cid))

    db.commit()
    add_audit_log(db, current_user, "ZONE_UPDATED", "zone", zone_id, f"Zone: {zone.name}",
                  request.client.host if request.client else None)
    return {"ok": True}


@router.delete("/{zone_id}")
def delete_zone(
    request: Request,
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    zone = db.get(CameraZone, zone_id)
    if not zone:
        raise HTTPException(404, "Zone not found")

    zone_name = zone.name
    db.query(CameraZoneMapping).filter(CameraZoneMapping.zone_id == zone_id).delete()
    db.delete(zone)
    db.commit()

    add_audit_log(db, current_user, "ZONE_DELETED", "zone", zone_id, f"Zone: {zone_name}",
                  request.client.host if request.client else None)
    return {"ok": True}


@router.get("/{zone_id}/stats")
def zone_stats(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return event counts per camera within a zone."""
    from app.models import FaceEvent
    from sqlalchemy import func

    zone = db.get(CameraZone, zone_id)
    if not zone:
        raise HTTPException(404, "Zone not found")

    mappings = db.query(CameraZoneMapping).filter(CameraZoneMapping.zone_id == zone_id).all()
    camera_ids = [m.camera_id for m in mappings]
    cameras = db.query(CameraDevice).filter(CameraDevice.id.in_(camera_ids)).all() if camera_ids else []

    camera_names = [c.name for c in cameras]
    rows = (db.query(FaceEvent.camera_name, func.count(FaceEvent.id))
            .filter(FaceEvent.source == "face_analytics")
            .filter(FaceEvent.camera_name.in_(camera_names))
            .group_by(FaceEvent.camera_name)
            .all())

    camera_event_counts = {row[0]: row[1] for row in rows}
    total_events = sum(camera_event_counts.values())

    return {
        "zone_id": zone_id,
        "zone_name": zone.name,
        "total_events": total_events,
        "cameras": [
            {"camera_id": c.id, "camera_name": c.name, "events": camera_event_counts.get(c.name, 0)}
            for c in cameras
        ],
    }
