"""Feature 9: Lift / Floor Access Control."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.models import AccessControlDevice, AccessLevel, LiftConfig, LiftFloorAccess, User
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/lift", tags=["acs_lift"])


def _lift_out(l: LiftConfig, *, include_access: bool = True) -> dict:
    d = {
        "id": l.id, "name": l.name, "device_id": l.device_id,
        "device_name": l.device.name if l.device else None,
        "door_no": l.door_no,
        "floors": json.loads(l.floors or "[]"),
        "is_active": bool(l.is_active), "notes": l.notes,
        "created_at": l.created_at,
    }
    if include_access:
        d["floor_access"] = [
            {
                "id": fa.id,
                "access_level_id": fa.access_level_id,
                "access_level_name": fa.access_level.name if fa.access_level else None,
                "allowed_floors": json.loads(fa.allowed_floors or "[]"),
            }
            for fa in (l.floor_access or [])
        ]
    return d


# ── Lift CRUD ─────────────────────────────────────────────────────────────────

@router.get("")
def list_lifts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lifts = db.query(LiftConfig).options(
        joinedload(LiftConfig.device),
        joinedload(LiftConfig.floor_access).joinedload(LiftFloorAccess.access_level),
    ).all()
    return [_lift_out(l) for l in lifts]


@router.post("")
def create_lift(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    for field in ("name", "device_id", "door_no"):
        if not data.get(field):
            raise HTTPException(400, f"{field} is required")
    device = db.get(AccessControlDevice, data["device_id"])
    if not device:
        raise HTTPException(404, "ACS device not found")
    floors = data.get("floors") or []
    lift = LiftConfig(
        name=data["name"].strip(),
        device_id=int(data["device_id"]),
        door_no=int(data["door_no"]),
        floors=json.dumps(floors),
        notes=data.get("notes"),
        is_active=1 if data.get("is_active", True) else 0,
    )
    db.add(lift); db.commit()
    lift = db.query(LiftConfig).options(
        joinedload(LiftConfig.device),
        joinedload(LiftConfig.floor_access).joinedload(LiftFloorAccess.access_level),
    ).filter(LiftConfig.id == lift.id).first()
    return _lift_out(lift)


@router.patch("/{lift_id}")
def update_lift(
    lift_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    lift = db.query(LiftConfig).options(
        joinedload(LiftConfig.device),
        joinedload(LiftConfig.floor_access).joinedload(LiftFloorAccess.access_level),
    ).filter(LiftConfig.id == lift_id).first()
    if not lift:
        raise HTTPException(404, "Lift not found")
    if "name" in data:
        lift.name = data["name"].strip()
    if "floors" in data:
        lift.floors = json.dumps(data["floors"])
    if "notes" in data:
        lift.notes = data["notes"]
    if "is_active" in data:
        lift.is_active = 1 if data["is_active"] else 0
    db.commit(); db.refresh(lift)
    return _lift_out(lift)


@router.delete("/{lift_id}")
def delete_lift(
    lift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    lift = db.get(LiftConfig, lift_id)
    if not lift:
        raise HTTPException(404, "Lift not found")
    db.delete(lift); db.commit()
    return {"ok": True}


# ── Floor Access per Access Level ─────────────────────────────────────────────

@router.post("/{lift_id}/access")
def set_floor_access(
    lift_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    lift = db.get(LiftConfig, lift_id)
    if not lift:
        raise HTTPException(404, "Lift not found")
    level = db.get(AccessLevel, data.get("access_level_id"))
    if not level:
        raise HTTPException(404, "Access level not found")

    existing = db.query(LiftFloorAccess).filter(
        LiftFloorAccess.lift_id == lift_id,
        LiftFloorAccess.access_level_id == data["access_level_id"],
    ).first()
    if existing:
        existing.allowed_floors = json.dumps(data.get("allowed_floors") or [])
        db.commit()
        fa = existing
    else:
        fa = LiftFloorAccess(
            lift_id=lift_id,
            access_level_id=data["access_level_id"],
            allowed_floors=json.dumps(data.get("allowed_floors") or []),
        )
        db.add(fa); db.commit(); db.refresh(fa)

    fa.access_level = level
    return {
        "id": fa.id, "lift_id": lift_id,
        "access_level_id": fa.access_level_id,
        "access_level_name": level.name,
        "allowed_floors": json.loads(fa.allowed_floors or "[]"),
    }


@router.delete("/{lift_id}/access/{access_id}")
def delete_floor_access(
    lift_id: int, access_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    fa = db.query(LiftFloorAccess).filter(
        LiftFloorAccess.id == access_id,
        LiftFloorAccess.lift_id == lift_id,
    ).first()
    if not fa:
        raise HTTPException(404, "Floor access not found")
    db.delete(fa); db.commit()
    return {"ok": True}


@router.get("/{lift_id}/person-floors/{person_id}")
def get_person_floors(
    lift_id: int, person_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Which floors can this person access in this lift (union of all their access levels)?"""
    from app.models import AccessLevelMember
    level_ids = [
        m.access_level_id for m in
        db.query(AccessLevelMember).filter(AccessLevelMember.person_id == person_id).all()
    ]
    if not level_ids:
        return {"lift_id": lift_id, "person_id": person_id, "allowed_floors": []}

    accesses = db.query(LiftFloorAccess).filter(
        LiftFloorAccess.lift_id == lift_id,
        LiftFloorAccess.access_level_id.in_(level_ids),
    ).all()

    all_floors: set = set()
    for acc in accesses:
        all_floors.update(json.loads(acc.allowed_floors or "[]"))

    return {"lift_id": lift_id, "person_id": person_id, "allowed_floors": sorted(all_floors)}
