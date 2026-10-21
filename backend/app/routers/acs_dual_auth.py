"""Two-person authorization workflow for high-security doors."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.acs_access_limit import _find_person
from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.hiksdk_client import acs_door_control_isapi_sync
from app.models import (
    AccessControlDevice,
    AcsAccessEvent,
    DualAuthPending,
    DualAuthRule,
    User,
)
from app.secrets import decrypt_camera_password
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/dual-auth", tags=["acs_dual_auth"])


def _compatible_now(value):
    now = utc_now()
    if value is not None and value.tzinfo is None and now.tzinfo is not None:
        return now.replace(tzinfo=None)
    return now


def _rule_out(rule: DualAuthRule) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "description": rule.description or "",
        "device_id": rule.device_id,
        "device_name": rule.device.name if rule.device else None,
        "door_no": rule.door_no,
        "timeout_seconds": rule.timeout_seconds,
        "is_active": bool(rule.is_active),
        "created_at": rule.created_at,
    }


def _pending_out(pending: DualAuthPending) -> dict:
    rule = pending.rule
    return {
        "id": pending.id,
        "rule_id": pending.rule_id,
        "rule_name": rule.name if rule else None,
        "device_id": rule.device_id if rule else None,
        "door_no": rule.door_no if rule else None,
        "first_person_id": pending.first_person_id,
        "first_person_name": (
            pending.first_person.full_name if pending.first_person else None
        ),
        "first_card_number": pending.first_card_number,
        "person_name": pending.first_person.full_name if pending.first_person else None,
        "card_number": pending.first_card_number,
        "expires_at": pending.expires_at,
        "created_at": pending.created_at,
        "seconds_remaining": max(
            0,
            int((pending.expires_at - _compatible_now(pending.expires_at)).total_seconds()),
        ),
    }


def _validated_rule(data: dict, device: AccessControlDevice) -> dict:
    try:
        door_no = int(data.get("door_no") or 0)
        timeout_seconds = int(data.get("timeout_seconds") or 30)
    except (TypeError, ValueError):
        raise HTTPException(400, "door_no and timeout_seconds must be integers")
    if not 1 <= door_no <= int(device.door_count or 1):
        raise HTTPException(400, "door_no is outside the controller door range")
    if not 10 <= timeout_seconds <= 300:
        raise HTTPException(400, "timeout_seconds must be between 10 and 300")
    name = (data.get("name") or data.get("description") or "").strip()
    if not name:
        name = f"{device.name} Door {door_no} dual authorization"
    return {
        "name": name,
        "door_no": door_no,
        "timeout_seconds": timeout_seconds,
    }


@router.get("/rules")
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rules = db.query(DualAuthRule).options(
        joinedload(DualAuthRule.device),
    ).all()
    return [_rule_out(rule) for rule in rules]


@router.post("/rules")
def create_rule(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not data.get("device_id"):
        raise HTTPException(400, "device_id is required")
    device = db.get(AccessControlDevice, int(data["device_id"]))
    if not device:
        raise HTTPException(404, "ACS device not found")
    values = _validated_rule(data, device)
    duplicate = db.query(DualAuthRule).filter(
        DualAuthRule.device_id == device.id,
        DualAuthRule.door_no == values["door_no"],
    ).first()
    if duplicate:
        raise HTTPException(409, "A dual-authorization rule already exists for this door")
    rule = DualAuthRule(
        name=values["name"],
        description=data.get("description") or None,
        device_id=device.id,
        door_no=values["door_no"],
        timeout_seconds=values["timeout_seconds"],
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
        db.query(DualAuthRule)
        .options(joinedload(DualAuthRule.device))
        .filter(DualAuthRule.id == rule_id)
        .first()
    )
    if not rule:
        raise HTTPException(404, "Rule not found")
    values = _validated_rule({
        "name": data.get("name", data.get("description", rule.name)),
        "door_no": data.get("door_no", rule.door_no),
        "timeout_seconds": data.get("timeout_seconds", rule.timeout_seconds),
    }, rule.device)
    rule.name = values["name"]
    rule.door_no = values["door_no"]
    rule.timeout_seconds = values["timeout_seconds"]
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
    rule = db.get(DualAuthRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"ok": True}


@router.get("/pending")
def list_pending(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = utc_now()
    db.query(DualAuthPending).filter(DualAuthPending.expires_at <= now).delete()
    db.commit()
    pending = db.query(DualAuthPending).options(
        joinedload(DualAuthPending.first_person),
        joinedload(DualAuthPending.rule),
    ).all()
    return [_pending_out(item) for item in pending]


@router.post("/initiate")
def initiate_dual_auth(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    device_id = data.get("device_id")
    door_no = data.get("door_no")
    person_id = data.get("person_id")
    card_number = str(data.get("card_number") or "").strip() or None
    if not device_id or not door_no:
        raise HTTPException(400, "device_id and door_no are required")
    if not person_id and not card_number:
        raise HTTPException(400, "First person or card number is required")

    rule = db.query(DualAuthRule).filter(
        DualAuthRule.device_id == int(device_id),
        DualAuthRule.door_no == int(door_no),
        DualAuthRule.is_active == 1,
    ).first()
    if not rule:
        raise HTTPException(404, "No active dual-authorization rule for this door")

    now = utc_now()
    db.query(DualAuthPending).filter(
        DualAuthPending.rule_id == rule.id,
        DualAuthPending.expires_at <= now,
    ).delete()
    existing = db.query(DualAuthPending).filter(
        DualAuthPending.rule_id == rule.id,
        DualAuthPending.expires_at > now,
    ).first()
    if existing:
        raise HTTPException(409, "This door is already waiting for a second credential")

    pending = DualAuthPending(
        rule_id=rule.id,
        first_person_id=person_id,
        first_card_number=card_number,
        expires_at=now + timedelta(seconds=rule.timeout_seconds),
    )
    db.add(pending)
    db.commit()
    db.refresh(pending)
    pending.rule = rule
    return {**_pending_out(pending), "message": "Waiting for second authorization"}


@router.post("/confirm/{pending_id}")
def confirm_dual_auth(
    pending_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    pending = (
        db.query(DualAuthPending)
        .options(
            joinedload(DualAuthPending.rule),
            joinedload(DualAuthPending.first_person),
        )
        .filter(DualAuthPending.id == pending_id)
        .first()
    )
    if not pending:
        raise HTTPException(404, "Pending session not found or already confirmed")
    if pending.expires_at <= _compatible_now(pending.expires_at):
        db.delete(pending)
        db.commit()
        raise HTTPException(410, "Dual-authorization session expired")

    second_card = str(data.get("card_number") or "").strip()
    if not second_card:
        raise HTTPException(400, "Second card number is required")
    if pending.first_card_number and second_card == pending.first_card_number:
        raise HTTPException(409, "Second authorization must use a different card")
    second_person = _find_person(db, {"card_number": second_card})
    if not second_person or not second_person.acs_active:
        raise HTTPException(404, "Second card is not assigned to an active person")
    if second_person.id == pending.first_person_id:
        raise HTTPException(409, "Second authorization must be a different person")

    rule = pending.rule
    device = db.get(AccessControlDevice, rule.device_id)
    if not device or not device.is_active:
        raise HTTPException(409, "Controller is unavailable")
    unlock = acs_door_control_isapi_sync(
        device.ip_address,
        device.http_port or 80,
        device.username or "admin",
        decrypt_camera_password(device.password or ""),
        rule.door_no,
        "unlock",
    )
    if not unlock.get("ok"):
        raise HTTPException(
            502,
            unlock.get("message") or "Controller rejected the unlock command",
        )

    db.delete(pending)
    db.add(AcsAccessEvent(
        device_id=rule.device_id,
        door_no=rule.door_no,
        card_number=second_card,
        person_id=second_person.id,
        event_type="access_granted",
        verify_mode="dual_auth",
        created_at=utc_now(),
    ))
    db.commit()
    return {
        "ok": True,
        "message": "Dual authorization confirmed; door unlocked",
        "rule_name": rule.name,
        "device_id": rule.device_id,
        "door_no": rule.door_no,
        "second_person_id": second_person.id,
        "second_person_name": second_person.full_name,
        "unlock": unlock,
    }
