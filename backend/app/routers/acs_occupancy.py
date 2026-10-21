"""Feature 15: Real-Time Zone Occupancy — headcount per zone via IN/OUT events."""

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.models import OccupancyZone, OccupancyZoneEntry, Person, User
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/occupancy", tags=["acs_occupancy"])


def _zone_out(z: OccupancyZone, *, count: int = 0) -> dict:
    return {
        "id": z.id, "name": z.name, "description": z.description,
        "max_capacity": z.max_capacity,
        "color": z.color,
        "door_rules": json.loads(z.door_rules or "[]"),
        "is_active": bool(z.is_active),
        "current_count": count,
        "is_over_capacity": bool(z.max_capacity and count > z.max_capacity),
        "created_at": z.created_at,
    }


def _entry_out(e: OccupancyZoneEntry) -> dict:
    return {
        "id": e.id, "zone_id": e.zone_id,
        "person_id": e.person_id,
        "person_name": e.person.full_name if e.person else None,
        "card_number": e.card_number,
        "entered_at": e.entered_at,
        "exited_at": e.exited_at,
        "is_inside": e.exited_at is None,
    }


# ── Zone CRUD ─────────────────────────────────────────────────────────────────

@router.get("/zones")
def list_zones(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    zones = db.query(OccupancyZone).all()
    result = []
    for z in zones:
        count = db.query(OccupancyZoneEntry).filter(
            OccupancyZoneEntry.zone_id == z.id,
            OccupancyZoneEntry.exited_at.is_(None),
        ).count()
        result.append(_zone_out(z, count=count))
    return result


@router.post("/zones")
def create_zone(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not data.get("name"):
        raise HTTPException(400, "name is required")
    zone = OccupancyZone(
        name=data["name"].strip(),
        description=data.get("description"),
        max_capacity=data.get("max_capacity"),
        color=data.get("color", "#3B82F6"),
        door_rules=json.dumps(data.get("door_rules") or []),
        is_active=1 if data.get("is_active", True) else 0,
    )
    db.add(zone); db.commit(); db.refresh(zone)
    return _zone_out(zone)


@router.patch("/zones/{zone_id}")
def update_zone(
    zone_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    zone = db.get(OccupancyZone, zone_id)
    if not zone:
        raise HTTPException(404, "Zone not found")
    for field in ("name", "description", "max_capacity", "color"):
        if field in data:
            setattr(zone, field, data[field])
    if "door_rules" in data:
        zone.door_rules = json.dumps(data["door_rules"])
    if "is_active" in data:
        zone.is_active = 1 if data["is_active"] else 0
    db.commit(); db.refresh(zone)
    count = db.query(OccupancyZoneEntry).filter(
        OccupancyZoneEntry.zone_id == zone_id,
        OccupancyZoneEntry.exited_at.is_(None),
    ).count()
    return _zone_out(zone, count=count)


@router.delete("/zones/{zone_id}")
def delete_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    zone = db.get(OccupancyZone, zone_id)
    if not zone:
        raise HTTPException(404, "Zone not found")
    db.delete(zone); db.commit()
    return {"ok": True}


# ── Occupancy tracking ────────────────────────────────────────────────────────

@router.get("/zones/{zone_id}/inside")
def list_inside(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Who is currently inside this zone."""
    entries = (
        db.query(OccupancyZoneEntry)
        .options(joinedload(OccupancyZoneEntry.person))
        .filter(
            OccupancyZoneEntry.zone_id == zone_id,
            OccupancyZoneEntry.exited_at.is_(None),
        )
        .order_by(OccupancyZoneEntry.entered_at.desc())
        .all()
    )
    return [_entry_out(e) for e in entries]


@router.post("/zones/{zone_id}/entry")
def record_entry(
    zone_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a person entering the zone."""
    zone = db.get(OccupancyZone, zone_id)
    if not zone:
        raise HTTPException(404, "Zone not found")

    person_id   = data.get("person_id")
    card_number = data.get("card_number")
    direction   = data.get("direction", "in")

    if direction == "out" and person_id:
        # Mark last open entry as exited
        entry = (
            db.query(OccupancyZoneEntry)
            .filter(
                OccupancyZoneEntry.zone_id == zone_id,
                OccupancyZoneEntry.person_id == person_id,
                OccupancyZoneEntry.exited_at.is_(None),
            )
            .first()
        )
        if entry:
            entry.exited_at = utc_now()
            db.commit()
            return _entry_out(entry)
        return {"ok": True, "message": "No open entry found for this person"}

    # Record new entry
    entry = OccupancyZoneEntry(
        zone_id=zone_id,
        person_id=person_id,
        card_number=card_number,
        entered_at=utc_now(),
    )
    db.add(entry); db.commit()
    entry = db.query(OccupancyZoneEntry).options(
        joinedload(OccupancyZoneEntry.person)
    ).filter(OccupancyZoneEntry.id == entry.id).first()
    return _entry_out(entry)


@router.post("/zones/{zone_id}/reset")
def reset_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Mark all persons as exited (manual reset after shift end)."""
    now = utc_now()
    db.query(OccupancyZoneEntry).filter(
        OccupancyZoneEntry.zone_id == zone_id,
        OccupancyZoneEntry.exited_at.is_(None),
    ).update({"exited_at": now})
    db.commit()
    return {"ok": True, "zone_id": zone_id, "reset_at": now}


# ── Live snapshot across all zones ───────────────────────────────────────────

@router.get("/snapshot")
def occupancy_snapshot(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Current headcount across every active zone."""
    zones = db.query(OccupancyZone).filter(OccupancyZone.is_active == 1).all()
    result = []
    for z in zones:
        count = db.query(OccupancyZoneEntry).filter(
            OccupancyZoneEntry.zone_id == z.id,
            OccupancyZoneEntry.exited_at.is_(None),
        ).count()
        result.append({
            "zone_id": z.id, "zone_name": z.name,
            "color": z.color,
            "current_count": count,
            "max_capacity": z.max_capacity,
            "is_over_capacity": bool(z.max_capacity and count > z.max_capacity),
        })
    total = sum(r["current_count"] for r in result)
    return {"total_inside": total, "snapshot_at": utc_now(), "zones": result}


# ── Process ACS event → update occupancy ─────────────────────────────────────

def process_occupancy_event(db: Session, device_id: int, door_no: int,
                             person_id, card_number: str, direction: str) -> None:
    """
    Called from ACS event ingest. Matches device_id+door_no+direction against
    zone door_rules and updates occupancy entries.
    """
    if not direction:
        return
    zones = db.query(OccupancyZone).filter(OccupancyZone.is_active == 1).all()
    for zone in zones:
        rules = json.loads(zone.door_rules or "[]")
        for rule in rules:
            if (rule.get("device_id") == device_id and
                    rule.get("door_no") == door_no and
                    rule.get("direction") == direction):
                from app.routers.acs_occupancy import record_entry
                if direction == "in":
                    entry = OccupancyZoneEntry(
                        zone_id=zone.id, person_id=person_id,
                        card_number=card_number, entered_at=utc_now(),
                    )
                    db.add(entry)
                elif direction == "out" and person_id:
                    open_entry = db.query(OccupancyZoneEntry).filter(
                        OccupancyZoneEntry.zone_id == zone.id,
                        OccupancyZoneEntry.person_id == person_id,
                        OccupancyZoneEntry.exited_at.is_(None),
                    ).first()
                    if open_entry:
                        open_entry.exited_at = utc_now()
                break
    db.commit()
