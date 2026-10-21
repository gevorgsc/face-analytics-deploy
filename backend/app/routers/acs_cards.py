"""ACS Card Management router — issue, revoke, sync cards to Hikvision devices."""

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import AccessControlDevice, AcsAccessEvent, CardIssue, Person, User
from app.secrets import decrypt_camera_password
from app.utils import add_audit_log, utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/acs/cards", tags=["acs_cards"])
_executor = ThreadPoolExecutor(max_workers=4)


def _serialize(ci: CardIssue) -> dict:
    return {
        "id":          ci.id,
        "person_id":   ci.person_id,
        "person_name": ci.person.full_name if ci.person else None,
        "department":  ci.person.department if ci.person else None,
        "device_id":   ci.device_id,
        "device_name": ci.device.name if ci.device else None,
        "card_number": ci.card_number,
        "card_type":   ci.card_type,
        "valid_from":  ci.valid_from,
        "valid_to":    ci.valid_to,
        "status":      ci.status,
        "note":        ci.note,
        "created_at":  ci.created_at,
    }


# ── List all issued cards ─────────────────────────────────────────────────────

@router.get("")
def list_cards(
    device_id: Optional[int] = Query(None),
    person_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(CardIssue)
        .options(joinedload(CardIssue.person), joinedload(CardIssue.device))
        .order_by(CardIssue.created_at.desc())
    )
    if device_id: q = q.filter(CardIssue.device_id == device_id)
    if person_id: q = q.filter(CardIssue.person_id == person_id)
    if status:    q = q.filter(CardIssue.status == status)
    return [_serialize(c) for c in q.limit(limit).all()]


# ── Issue a card (create + push to device) ────────────────────────────────────

@router.post("")
async def issue_card(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    person_id   = data.get("person_id")
    device_id   = data.get("device_id")
    card_number = (data.get("card_number") or "").strip()
    card_type   = data.get("card_type", "normal")
    valid_from  = data.get("valid_from")
    valid_to    = data.get("valid_to")
    note        = data.get("note") or ""

    if not person_id or not device_id or not card_number:
        raise HTTPException(400, "person_id, device_id and card_number are required")

    person = db.get(Person, person_id)
    device = db.get(AccessControlDevice, device_id)
    if not person: raise HTTPException(404, "Person not found")
    if not device: raise HTTPException(404, "ACS device not found")

    # Check for duplicate on same device
    existing = db.query(CardIssue).filter(
        CardIssue.device_id == device_id,
        CardIssue.card_number == card_number,
        CardIssue.status == "active",
    ).first()
    if existing:
        raise HTTPException(409, f"Card {card_number} is already active on this device")

    # Push to device via ISAPI
    password = decrypt_camera_password(device.password or "") if device.password else ""
    from app.isapi_acs import card_push_isapi
    loop = asyncio.get_running_loop()

    vf = valid_from[:10] if valid_from else ""
    vt = valid_to[:10]   if valid_to   else ""

    push_result = await loop.run_in_executor(
        _executor, card_push_isapi,
        device.ip_address, device.http_port or 80,
        device.username or "admin", password,
        card_number,
        str(person_id),
        person.full_name or "",
        card_type + "Card" if not card_type.endswith("Card") else card_type,
        vf, vt,
    )

    now = utc_now()
    ci = CardIssue(
        person_id   = person_id,
        device_id   = device_id,
        card_number = card_number,
        card_type   = card_type,
        valid_from  = datetime.fromisoformat(valid_from) if valid_from else None,
        valid_to    = datetime.fromisoformat(valid_to)   if valid_to   else None,
        status      = "active" if push_result.get("ok") else "error",
        note        = note,
        created_at  = now,
        updated_at  = now,
    )
    db.add(ci)

    # Also update person.card_number (latest card)
    person.card_number = card_number
    db.commit()
    db.refresh(ci)

    add_audit_log(db, current_user, "CARD_ISSUED", "card_issue", ci.id,
                  f"Card {card_number} → {person.full_name} on {device.name}. "
                  f"Push: {'OK' if push_result.get('ok') else push_result.get('message')}",
                  request.client.host if request.client else None)

    return {
        "ok":          True,
        "card":        _serialize(ci),
        "device_push": push_result,
    }


# ── Revoke a card ─────────────────────────────────────────────────────────────

@router.delete("/{card_id}")
async def revoke_card(
    request: Request,
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    ci = db.query(CardIssue).options(
        joinedload(CardIssue.person), joinedload(CardIssue.device)
    ).filter(CardIssue.id == card_id).first()
    if not ci: raise HTTPException(404, "Card not found")

    device   = ci.device
    password = decrypt_camera_password(device.password or "") if device and device.password else ""

    from app.isapi_acs import card_delete_isapi
    loop = asyncio.get_running_loop()
    del_result = await loop.run_in_executor(
        _executor, card_delete_isapi,
        device.ip_address, device.http_port or 80,
        device.username or "admin", password,
        ci.card_number,
    )

    ci.status     = "revoked"
    ci.updated_at = utc_now()
    db.commit()

    add_audit_log(db, current_user, "CARD_REVOKED", "card_issue", card_id,
                  f"Revoked card {ci.card_number} from {ci.person.full_name if ci.person else '?'}. "
                  f"Delete: {'OK' if del_result.get('ok') else del_result.get('message')}",
                  request.client.host if request.client else None)

    return {"ok": True, "device_delete": del_result}


# ── Bulk revoke all active cards for a person ─────────────────────────────────

@router.delete("/bulk-revoke/{person_id}")
async def bulk_revoke_person_cards(
    request: Request,
    person_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """Revoke all active cards for a person across all devices."""
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    active_cards = db.query(CardIssue).filter(
        CardIssue.person_id == person_id,
        CardIssue.status == "active",
    ).all()

    if not active_cards:
        return {"ok": True, "revoked": 0, "message": "No active cards to revoke"}

    loop = asyncio.get_running_loop()
    revoked = 0
    errors = []

    for ci in active_cards:
        device = db.get(AccessControlDevice, ci.device_id)
        if not device:
            ci.status = "revoked"
            ci.updated_at = utc_now()
            revoked += 1
            continue

        password = decrypt_camera_password(device.password or "") if device.password else ""
        from app.isapi_acs import card_delete_isapi
        try:
            del_result = await loop.run_in_executor(
                _executor, card_delete_isapi,
                device.ip_address, device.http_port or 80,
                device.username or "admin", password,
                ci.card_number,
            )
            ci.status = "revoked"
            ci.updated_at = utc_now()
            revoked += 1
            if not del_result.get("ok"):
                errors.append(f"Device {device.name}: {del_result.get('message')}")
        except Exception as exc:
            errors.append(str(exc))
            ci.status = "revoked"
            ci.updated_at = utc_now()
            revoked += 1

    db.commit()

    add_audit_log(db, current_user, "CARDS_BULK_REVOKED", "person", person_id,
                  f"Bulk revoked {revoked} cards for {person.full_name}",
                  request.client.host if request.client else None)

    return {"ok": True, "revoked": revoked, "errors": errors}


# ── List cards stored on device ───────────────────────────────────────────────

@router.get("/on-device/{device_id}")
async def cards_on_device(
    device_id: int,
    offset: int = Query(0),
    limit: int  = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    device = db.get(AccessControlDevice, device_id)
    if not device: raise HTTPException(404, "ACS device not found")

    password = decrypt_camera_password(device.password or "") if device.password else ""
    from app.isapi_acs import card_list_isapi
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _executor, card_list_isapi,
        device.ip_address, device.http_port or 80,
        device.username or "admin", password,
        offset, limit,
    )
    return result
