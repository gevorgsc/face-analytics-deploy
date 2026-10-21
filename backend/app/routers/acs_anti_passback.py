"""Paired-door anti-passback rules, state tracking, and violations."""

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import (
    AccessControlDevice,
    AntiPassbackRule,
    AntiPassbackState,
    AntiPassbackViolation,
    User,
)
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/anti-passback", tags=["acs_anti_passback"])


def _rule_out(rule: AntiPassbackRule) -> dict:
    return {
        "id": rule.id,
        "device_id": rule.device_id,
        "device_name": rule.device.name if rule.device else None,
        "door_no_in": rule.door_no_in or rule.door_no,
        "door_no_out": rule.door_no_out or rule.door_no,
        "reset_hours": rule.reset_hours or 0,
        "mode": rule.mode,
        "is_active": bool(rule.is_active),
        "created_at": rule.created_at,
    }


def _violation_out(violation: AntiPassbackViolation) -> dict:
    return {
        "id": violation.id,
        "rule_id": violation.rule_id,
        "device_id": violation.device_id,
        "device_name": violation.device.name if violation.device else None,
        "door_no": violation.door_no,
        "person_id": violation.person_id,
        "person_name": violation.person.full_name if violation.person else None,
        "card_number": violation.card_number,
        "attempted_direction": violation.attempted_direction,
        "direction": violation.attempted_direction,
        "mode": violation.mode,
        "created_at": violation.created_at,
    }


def _validated_rule_values(data: dict, device: AccessControlDevice) -> dict:
    try:
        door_in = int(data.get("door_no_in") or data.get("door_no") or 0)
        door_out = int(data.get("door_no_out") or data.get("door_no") or 0)
        reset_hours = int(data.get("reset_hours", 12))
    except (TypeError, ValueError):
        raise HTTPException(400, "Door numbers and reset hours must be integers")
    door_count = int(device.door_count or 1)
    if not 1 <= door_in <= door_count or not 1 <= door_out <= door_count:
        raise HTTPException(400, f"Door numbers must be between 1 and {door_count}")
    if door_count > 1 and door_in == door_out:
        raise HTTPException(400, "IN and OUT doors must be different")
    if not 0 <= reset_hours <= 168:
        raise HTTPException(400, "reset_hours must be between 0 and 168")
    mode = (data.get("mode") or "soft").lower()
    if mode not in {"soft", "hard"}:
        raise HTTPException(400, "mode must be soft or hard")
    return {
        "door_no_in": door_in,
        "door_no_out": door_out,
        "reset_hours": reset_hours,
        "mode": mode,
    }


@router.get("/rules")
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rules = (
        db.query(AntiPassbackRule)
        .options(joinedload(AntiPassbackRule.device))
        .order_by(AntiPassbackRule.id)
        .all()
    )
    return [_rule_out(rule) for rule in rules]


@router.post("/rules")
def create_rule(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    device_id = data.get("device_id")
    if not device_id:
        raise HTTPException(400, "device_id is required")
    device = db.get(AccessControlDevice, int(device_id))
    if not device:
        raise HTTPException(404, "ACS device not found")
    values = _validated_rule_values(data, device)
    duplicate = db.query(AntiPassbackRule).filter(
        AntiPassbackRule.device_id == device.id,
        AntiPassbackRule.door_no_in == values["door_no_in"],
        AntiPassbackRule.door_no_out == values["door_no_out"],
    ).first()
    if duplicate:
        raise HTTPException(409, "This IN/OUT anti-passback pair already exists")
    rule = AntiPassbackRule(
        device_id=device.id,
        door_no=values["door_no_in"],
        door_no_in=values["door_no_in"],
        door_no_out=values["door_no_out"],
        reset_hours=values["reset_hours"],
        mode=values["mode"],
        is_active=1 if data.get("is_active", True) else 0,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    rule.device = device
    return _rule_out(rule)


@router.patch("/rules/{rule_id}")
def update_rule(
    rule_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rule = (
        db.query(AntiPassbackRule)
        .options(joinedload(AntiPassbackRule.device))
        .filter(AntiPassbackRule.id == rule_id)
        .first()
    )
    if not rule:
        raise HTTPException(404, "Rule not found")
    values = _validated_rule_values({
        "door_no_in": data.get("door_no_in", rule.door_no_in or rule.door_no),
        "door_no_out": data.get("door_no_out", rule.door_no_out or rule.door_no),
        "reset_hours": data.get("reset_hours", rule.reset_hours or 0),
        "mode": data.get("mode", rule.mode),
    }, rule.device)
    rule.door_no = values["door_no_in"]
    rule.door_no_in = values["door_no_in"]
    rule.door_no_out = values["door_no_out"]
    rule.reset_hours = values["reset_hours"]
    rule.mode = values["mode"]
    if "is_active" in data:
        rule.is_active = 1 if data["is_active"] else 0
    db.commit()
    db.refresh(rule)
    return _rule_out(rule)


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rule = db.get(AntiPassbackRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"ok": True}


@router.get("/violations")
def list_violations(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    violations = (
        db.query(AntiPassbackViolation)
        .options(
            joinedload(AntiPassbackViolation.person),
            joinedload(AntiPassbackViolation.device),
        )
        .order_by(AntiPassbackViolation.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_violation_out(violation) for violation in violations]


@router.get("/states")
def list_states(
    person_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AntiPassbackState).options(
        joinedload(AntiPassbackState.person),
        joinedload(AntiPassbackState.rule),
    )
    if person_id:
        query = query.filter(AntiPassbackState.person_id == person_id)
    return [
        {
            "id": state.id,
            "person_id": state.person_id,
            "person_name": state.person.full_name if state.person else None,
            "device_id": state.device_id,
            "rule_id": state.rule_id,
            "door_no": state.door_no,
            "last_direction": state.last_direction,
            "last_event_at": state.last_event_at,
        }
        for state in query.all()
    ]


@router.post("/reset/{person_id}")
def reset_person_state(
    person_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    db.query(AntiPassbackState).filter(
        AntiPassbackState.person_id == person_id,
    ).delete()
    db.commit()
    return {"ok": True, "person_id": person_id}


def check_and_update(
    db: Session,
    person_id: int,
    device_id: int,
    door_no: int,
    direction: str | None = None,
    card_number: str | None = None,
    *,
    update_state: bool = True,
    record_violation: bool = True,
) -> dict:
    rules = db.query(AntiPassbackRule).filter(
        AntiPassbackRule.device_id == device_id,
        AntiPassbackRule.is_active == 1,
    ).all()
    rule = next((
        item for item in rules
        if door_no in {
            item.door_no_in or item.door_no,
            item.door_no_out or item.door_no,
        }
    ), None)
    if not rule:
        return {"allowed": True}

    door_in = rule.door_no_in or rule.door_no
    door_out = rule.door_no_out or rule.door_no
    inferred_direction = (
        "in" if door_no == door_in
        else "out" if door_no == door_out
        else direction
    )
    if inferred_direction not in {"in", "out"}:
        return {"allowed": True, "rule_id": rule.id, "ignored": "unknown_direction"}

    state = db.query(AntiPassbackState).filter(
        AntiPassbackState.person_id == person_id,
        AntiPassbackState.rule_id == rule.id,
    ).first()
    reset_cutoff = utc_now() - timedelta(hours=rule.reset_hours or 0)
    if state and state.last_event_at and state.last_event_at.tzinfo is None:
        reset_cutoff = reset_cutoff.replace(tzinfo=None)
    if (
        state
        and rule.reset_hours
        and state.last_event_at
        and state.last_event_at <= reset_cutoff
    ):
        db.delete(state)
        db.flush()
        state = None

    if not state:
        if update_state:
            db.add(AntiPassbackState(
                person_id=person_id,
                device_id=device_id,
                rule_id=rule.id,
                door_no=door_no,
                last_direction=inferred_direction,
                last_event_at=utc_now(),
            ))
            db.commit()
        return {
            "allowed": True,
            "rule_id": rule.id,
            "direction": inferred_direction,
        }

    if state.last_direction == inferred_direction:
        if record_violation:
            db.add(AntiPassbackViolation(
                rule_id=rule.id,
                person_id=person_id,
                device_id=device_id,
                door_no=door_no,
                card_number=card_number,
                attempted_direction=inferred_direction,
                mode=rule.mode,
            ))
            db.commit()
        return {
            "allowed": rule.mode != "hard",
            "mode": rule.mode,
            "violation": True,
            "rule_id": rule.id,
            "direction": inferred_direction,
        }

    if update_state:
        state.door_no = door_no
        state.last_direction = inferred_direction
        state.last_event_at = utc_now()
        db.commit()
    return {
        "allowed": True,
        "rule_id": rule.id,
        "direction": inferred_direction,
    }


def process_access_event(db: Session, event) -> dict:
    if (
        event.event_type != "access_granted"
        or not event.person_id
        or not event.device_id
        or not event.door_no
    ):
        return {"allowed": True, "ignored": True}
    return check_and_update(
        db,
        event.person_id,
        event.device_id,
        event.door_no,
        event.direction,
        event.card_number,
    )
