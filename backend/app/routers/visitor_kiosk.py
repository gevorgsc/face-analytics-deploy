"""Public, tightly scoped visitor self-service endpoints."""

import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Person, Visitor, VisitorAccessRecord
from app.rate_limit import rate_limiter
from app.utils import utc_now

router = APIRouter(prefix="/api/visitor-kiosk", tags=["visitor_kiosk"])


def _code() -> str:
    return f"VIS-{secrets.token_hex(4).upper()}"


@router.get("/options")
def kiosk_options(db: Session = Depends(get_db)):
    hosts = db.query(Person).filter(
        Person.person_type == "employee",
        Person.full_name.isnot(None),
        Person.acs_active == 1,
    ).order_by(Person.full_name).limit(500).all()
    return {
        "hosts": [{"id": person.id, "name": person.full_name} for person in hosts],
        "id_types": ["Passport", "National ID", "Driver License"],
    }


@router.post("/reservations")
def kiosk_reservation(request: Request, data: dict, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    if rate_limiter.hit_fixed_window(f"visitor-kiosk:{client_ip}", 10, 60) > 10:
        raise HTTPException(429, "Too many visitor registrations. Try again shortly.")
    if data.get("website"):
        raise HTTPException(400, "Invalid registration")
    name = (data.get("full_name") or "").strip()
    if not name or not data.get("valid_to") or not data.get("consent_accepted"):
        raise HTTPException(400, "Name, visit end time, and consent are required")
    host_id = int(data["host_person_id"]) if data.get("host_person_id") else None
    host = db.get(Person, host_id) if host_id else None
    if host_id and not host:
        raise HTTPException(404, "Host employee not found")
    try:
        valid_from = datetime.fromisoformat(data.get("valid_from") or utc_now().isoformat())
        valid_to = datetime.fromisoformat(data["valid_to"])
    except ValueError:
        raise HTTPException(400, "Invalid visit date/time")
    if valid_to <= valid_from:
        raise HTTPException(400, "Visit end time must be after start time")
    now = utc_now()
    visitor = Visitor(
        full_name=name,
        phone=(data.get("phone") or "").strip() or None,
        company=(data.get("company") or "").strip() or None,
        host_name=host.full_name if host else None,
        host_person_id=host_id,
        visit_reason=(data.get("visit_reason") or "").strip() or None,
        id_type=data.get("id_type") or None,
        id_number=(data.get("id_number") or "").strip() or None,
        valid_from=valid_from,
        valid_to=valid_to,
        status="reserved",
        approval_status="pending",
        reservation_code=_code(),
        self_service_token=secrets.token_urlsafe(32),
        consent_accepted=1,
        source="kiosk",
        created_at=now,
        updated_at=now,
    )
    db.add(visitor)
    db.flush()
    db.add(VisitorAccessRecord(
        visitor_id=visitor.id,
        action="kiosk_reserved",
        occurred_at=now,
    ))
    db.commit()
    return {
        "ok": True,
        "reservation_code": visitor.reservation_code,
        "approval_status": visitor.approval_status,
    }
