"""Feature 14: Mobile Virtual Card — QR-based access cards for smartphones."""

import io
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import AccessControlDevice, MobileCard, Person, User
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/mobile-cards", tags=["acs_mobile_cards"])


def _card_out(c: MobileCard) -> dict:
    now = utc_now()
    expired = bool(c.valid_to and c.valid_to < now)
    effective_status = "expired" if (c.status == "active" and expired) else c.status
    return {
        "id": c.id,
        "person_id": c.person_id,
        "person_name": c.person.full_name if c.person else None,
        "device_id": c.device_id,
        "device_name": c.device.name if c.device else None,
        "token": c.token,
        "card_number": c.card_number,
        "valid_from": c.valid_from,
        "valid_to": c.valid_to,
        "status": effective_status,
        "last_used_at": c.last_used_at,
        "notes": c.notes,
        "created_at": c.created_at,
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("")
def list_cards(
    person_id: int = Query(None),
    status: str    = Query(None),
    limit: int     = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(MobileCard).options(
        joinedload(MobileCard.person),
        joinedload(MobileCard.device),
    )
    if person_id:
        q = q.filter(MobileCard.person_id == person_id)
    if status:
        q = q.filter(MobileCard.status == status)
    return [_card_out(c) for c in q.order_by(MobileCard.created_at.desc()).limit(limit).all()]


@router.post("")
def issue_card(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    if not data.get("person_id"):
        raise HTTPException(400, "person_id is required")
    person = db.get(Person, data["person_id"])
    if not person:
        raise HTTPException(404, "Person not found")

    device = None
    if data.get("device_id"):
        device = db.get(AccessControlDevice, data["device_id"])
        if not device:
            raise HTTPException(404, "ACS device not found")

    valid_from_str = data.get("valid_from")
    valid_to_str   = data.get("valid_to")
    valid_from = datetime.fromisoformat(valid_from_str) if valid_from_str else utc_now()
    valid_to   = datetime.fromisoformat(valid_to_str) if valid_to_str else None

    card = MobileCard(
        person_id=person.id,
        device_id=device.id if device else None,
        token=secrets.token_urlsafe(32),
        card_number=data.get("card_number"),
        valid_from=valid_from,
        valid_to=valid_to,
        status="active",
        issued_by=current_user.id,
        notes=data.get("notes"),
    )
    db.add(card); db.commit()
    card = db.query(MobileCard).options(
        joinedload(MobileCard.person),
        joinedload(MobileCard.device),
    ).filter(MobileCard.id == card.id).first()
    return _card_out(card)


@router.post("/{card_id}/revoke")
def revoke_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    card = db.query(MobileCard).options(
        joinedload(MobileCard.person),
        joinedload(MobileCard.device),
    ).filter(MobileCard.id == card_id).first()
    if not card:
        raise HTTPException(404, "Card not found")
    card.status = "revoked"
    db.commit()
    return _card_out(card)


@router.delete("/{card_id}")
def delete_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    card = db.get(MobileCard, card_id)
    if not card:
        raise HTTPException(404, "Card not found")
    db.delete(card); db.commit()
    return {"ok": True}


# ── QR Code generation ────────────────────────────────────────────────────────

@router.get("/{card_id}/qr")
def get_qr_code(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a QR code image for the mobile card token."""
    card = db.get(MobileCard, card_id)
    if not card:
        raise HTTPException(404, "Card not found")
    if card.status != "active":
        raise HTTPException(403, f"Card is {card.status}")

    try:
        import qrcode
    except ImportError:
        raise HTTPException(503, "qrcode package not installed")

    qr  = qrcode.make(card.token)
    buf = io.BytesIO()
    qr.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png",
                             headers={"Content-Disposition": f'inline; filename="mobile_card_{card_id}.png"'})


# ── Token validation (called by entry reader) ─────────────────────────────────

@router.post("/validate")
def validate_token(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """Validate a scanned QR token and log usage."""
    token = (data.get("token") or "").strip()
    if not token:
        raise HTTPException(400, "token required")

    card = db.query(MobileCard).options(
        joinedload(MobileCard.person)
    ).filter(MobileCard.token == token).first()
    if not card:
        return {"valid": False, "reason": "token_not_found"}

    now = utc_now()
    if card.status != "active":
        return {"valid": False, "reason": card.status}
    if card.valid_to and card.valid_to < now:
        card.status = "expired"; db.commit()
        return {"valid": False, "reason": "expired"}
    if card.valid_from > now:
        return {"valid": False, "reason": "not_yet_valid"}

    card.last_used_at = now
    db.commit()

    return {
        "valid": True,
        "person_id": card.person_id,
        "person_name": card.person.full_name if card.person else None,
        "device_id": card.device_id,
    }
