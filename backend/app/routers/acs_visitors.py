"""ACS Visitor Management router — temporary access with QR + optional card."""

import hashlib
import hmac
import io
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import (
    AccessControlDevice,
    AccessLevel,
    Person,
    Visitor,
    VisitorAccessRecord,
    VisitorWatchEntry,
    User,
)
from app.utils import add_audit_log, utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/acs/visitors", tags=["acs_visitors"])

_QR_SECRET = os.getenv("SECRET_KEY", "change-me")


def _make_qr_token(visitor_id: int) -> str:
    raw = secrets.token_hex(8)
    sig = hmac.new(_QR_SECRET.encode(), f"visitor:{visitor_id}:{raw}".encode(),
                   hashlib.sha256).hexdigest()[:16]
    return f"{visitor_id}_{raw}_{sig}"


def _new_code(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(4).upper()}"


def _watch_matches(db: Session, visitor: Visitor) -> list[dict]:
    rows = db.query(VisitorWatchEntry).filter(VisitorWatchEntry.is_active == 1).all()
    result = []
    for row in rows:
        checks = [
            bool(row.id_number and visitor.id_number and row.id_number.strip().lower() == visitor.id_number.strip().lower()),
            bool(row.full_name and visitor.full_name and row.full_name.strip().lower() == visitor.full_name.strip().lower()),
            bool(row.organization and visitor.company and row.organization.strip().lower() == visitor.company.strip().lower()),
        ]
        matched = all(checks) if row.match_method == "all" and checks else any(checks)
        if matched:
            result.append({
                "id": row.id,
                "watch_type": row.watch_type,
                "reason": row.reason,
            })
    return result


def _record_access(db: Session, visitor: Visitor, action: str, user_id: int | None, note: str | None = None):
    db.add(VisitorAccessRecord(
        visitor_id=visitor.id,
        action=action,
        device_id=visitor.device_id,
        note=note,
        operator_id=user_id,
        occurred_at=utc_now(),
    ))


def _serialize(v: Visitor) -> dict:
    host = v.host_person
    return {
        "id":             v.id,
        "full_name":      v.full_name,
        "phone":          v.phone,
        "company":        v.company,
        "host_name":      v.host_name,
        "host_person_id": v.host_person_id,
        "host_person_name": host.full_name if host else v.host_name,
        "visit_reason":   v.visit_reason,
        "id_type":        v.id_type,
        "id_number":      v.id_number,
        "photo_path":     v.photo_path,
        "visitor_group":  v.visitor_group,
        "access_level_id": v.access_level_id,
        "access_level_name": v.access_level.name if v.access_level else None,
        "card_number":    v.card_number,
        "device_id":      v.device_id,
        "device_name":    v.device.name if v.device else None,
        "valid_from":     v.valid_from,
        "valid_to":       v.valid_to,
        "status":         v.status,
        "approval_status": v.approval_status,
        "reservation_code": v.reservation_code,
        "qr_token":       v.qr_token,
        "note":           v.note,
        "checked_in_at":  v.checked_in_at,
        "checked_out_at": v.checked_out_at,
        "consent_accepted": bool(v.consent_accepted),
        "source":          v.source,
        "approved_at":     v.approved_at,
        "watch_matches":   _watch_matches(v._sa_instance_state.session, v) if v._sa_instance_state.session else [],
        "created_at":     v.created_at,
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("")
def list_visitors(
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(Visitor)
        .options(
            joinedload(Visitor.device),
            joinedload(Visitor.host_person),
            joinedload(Visitor.access_level),
        )
        .order_by(Visitor.valid_from.desc())
    )
    if status: q = q.filter(Visitor.status == status)
    return [_serialize(v) for v in q.limit(limit).all()]


@router.post("")
def create_visitor(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    name   = (data.get("full_name") or "").strip()
    vf_str = data.get("valid_from") or utc_now().isoformat()
    vt_str = data.get("valid_to")

    if not name:  raise HTTPException(400, "full_name is required")
    if not vt_str: raise HTTPException(400, "valid_to is required")

    valid_from = datetime.fromisoformat(vf_str)
    valid_to   = datetime.fromisoformat(vt_str)
    if valid_to <= valid_from:
        raise HTTPException(400, "valid_to must be after valid_from")

    now = utc_now()
    host_person_id = int(data["host_person_id"]) if data.get("host_person_id") else None
    host = db.get(Person, host_person_id) if host_person_id else None
    access_level_id = int(data["access_level_id"]) if data.get("access_level_id") else None
    if host_person_id and not host:
        raise HTTPException(404, "Host employee not found")
    if access_level_id and not db.get(AccessLevel, access_level_id):
        raise HTTPException(404, "Access level not found")
    v = Visitor(
        full_name    = name,
        phone        = data.get("phone") or None,
        company      = data.get("company") or None,
        host_name    = host.full_name if host else (data.get("host_name") or None),
        host_person_id = host_person_id,
        visit_reason = data.get("visit_reason") or None,
        id_type      = data.get("id_type") or None,
        id_number    = data.get("id_number") or None,
        visitor_group = data.get("visitor_group") or "General",
        access_level_id = access_level_id,
        card_number  = data.get("card_number") or None,
        device_id    = data.get("device_id") or None,
        valid_from   = valid_from,
        valid_to     = valid_to,
        status       = "reserved",
        approval_status = "approved" if data.get("auto_approve") and current_user.role == "admin" else "pending",
        reservation_code = _new_code("VIS"),
        self_service_token = secrets.token_urlsafe(32),
        note         = data.get("note") or None,
        consent_accepted = 1 if data.get("consent_accepted") else 0,
        source       = data.get("source") or "operator",
        created_by   = current_user.id,
        created_at   = now,
        updated_at   = now,
    )
    db.add(v)
    db.flush()
    v.qr_token = _make_qr_token(v.id)
    _record_access(db, v, "reserved", current_user.id)
    db.commit()
    db.refresh(v)

    add_audit_log(db, current_user, "VISITOR_CREATED", "visitor", v.id,
                  f"Visitor: {v.full_name} valid {v.valid_from.date()} – {v.valid_to.date()}",
                  request.client.host if request.client else None)

    return _serialize(v)


@router.patch("/{visitor_id}")
def update_visitor(
    request: Request,
    visitor_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    v = db.get(Visitor, visitor_id)
    if not v: raise HTTPException(404, "Visitor not found")

    for field in ("full_name", "phone", "company", "host_name", "visit_reason",
                  "id_type", "id_number", "visitor_group", "card_number", "device_id",
                  "access_level_id", "status", "note"):
        if field in data:
            setattr(v, field, data[field] or None)
    if "host_person_id" in data:
        host_id = int(data["host_person_id"]) if data["host_person_id"] else None
        host = db.get(Person, host_id) if host_id else None
        if host_id and not host:
            raise HTTPException(404, "Host employee not found")
        v.host_person_id = host_id
        v.host_name = host.full_name if host else v.host_name
    if "valid_from" in data and data["valid_from"]:
        v.valid_from = datetime.fromisoformat(data["valid_from"])
    if "valid_to"   in data and data["valid_to"]:
        v.valid_to   = datetime.fromisoformat(data["valid_to"])

    v.updated_at = utc_now()
    db.commit()
    db.refresh(v)
    return _serialize(v)


@router.delete("/{visitor_id}")
def delete_visitor(
    visitor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    v = db.get(Visitor, visitor_id)
    if not v: raise HTTPException(404, "Visitor not found")
    db.delete(v)
    db.commit()
    return {"ok": True}


@router.get("/reference-data")
def visitor_reference_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hosts = db.query(Person).filter(
        Person.full_name.isnot(None),
        Person.person_type == "employee",
    ).order_by(Person.full_name).all()
    levels = db.query(AccessLevel).filter(AccessLevel.is_active == 1).order_by(AccessLevel.name).all()
    return {
        "hosts": [{"id": p.id, "name": p.full_name, "department": p.department} for p in hosts],
        "access_levels": [{"id": level.id, "name": level.name} for level in levels],
        "groups": ["General", "Contractor", "Interview", "Delivery", "VIP"],
    }


@router.get("/dashboard")
def visitor_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = utc_now()
    total    = db.query(func.count(Visitor.id)).scalar() or 0
    expected = db.query(func.count(Visitor.id)).filter(
        Visitor.status == "reserved", Visitor.valid_to >= now
    ).scalar() or 0
    inside   = db.query(func.count(Visitor.id)).filter(
        Visitor.checked_in_at.isnot(None), Visitor.checked_out_at.is_(None)
    ).scalar() or 0
    overdue  = db.query(func.count(Visitor.id)).filter(
        Visitor.checked_in_at.isnot(None), Visitor.checked_out_at.is_(None),
        Visitor.valid_to < now,
    ).scalar() or 0
    pending  = db.query(func.count(Visitor.id)).filter(
        Visitor.approval_status == "pending"
    ).scalar() or 0
    return {
        "total": total,
        "expected": expected,
        "inside": inside,
        "overdue": overdue,
        "pending_approval": pending,
    }


@router.post("/{visitor_id}/review")
def review_visitor(
    visitor_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    visitor = db.get(Visitor, visitor_id)
    if not visitor:
        raise HTTPException(404, "Visitor not found")
    decision = data.get("decision")
    if decision not in {"approved", "rejected"}:
        raise HTTPException(400, "decision must be approved or rejected")
    visitor.approval_status = decision
    visitor.status = "cancelled" if decision == "rejected" else "reserved"
    visitor.approved_by = current_user.id
    visitor.approved_at = utc_now()
    if data.get("note"):
        visitor.note = data["note"]
    _record_access(db, visitor, decision, current_user.id, data.get("note"))
    db.commit()
    db.refresh(visitor)
    return _serialize(visitor)


@router.get("/{visitor_id}/access-records")
def visitor_access_records(
    visitor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(VisitorAccessRecord).filter(
        VisitorAccessRecord.visitor_id == visitor_id,
    ).order_by(VisitorAccessRecord.occurred_at.desc()).all()
    return [{
        "id": row.id,
        "action": row.action,
        "device_id": row.device_id,
        "note": row.note,
        "occurred_at": row.occurred_at,
        "operator_id": row.operator_id,
    } for row in rows]


@router.get("/watch-list")
def list_watch_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [{
        "id": row.id, "full_name": row.full_name, "organization": row.organization,
        "id_type": row.id_type, "id_number": row.id_number, "match_method": row.match_method,
        "watch_type": row.watch_type, "reason": row.reason, "is_active": bool(row.is_active),
    } for row in db.query(VisitorWatchEntry).order_by(VisitorWatchEntry.id.desc()).all()]


@router.post("/watch-list")
def create_watch_entry(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    if not any(data.get(field) for field in ("full_name", "organization", "id_number")):
        raise HTTPException(400, "At least one monitored identifier is required")
    row = VisitorWatchEntry(
        full_name=data.get("full_name") or None,
        organization=data.get("organization") or None,
        id_type=data.get("id_type") or None,
        id_number=data.get("id_number") or None,
        match_method=data.get("match_method") or "any",
        watch_type=data.get("watch_type") or "important",
        reason=data.get("reason") or None,
        is_active=1,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "ok": True}


@router.delete("/watch-list/{entry_id}")
def delete_watch_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    row = db.get(VisitorWatchEntry, entry_id)
    if not row:
        raise HTTPException(404, "Watch entry not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/self-service/reserve")
def self_service_reserve(data: dict, db: Session = Depends(get_db)):
    name = (data.get("full_name") or "").strip()
    if not name or not data.get("valid_to") or not data.get("consent_accepted"):
        raise HTTPException(400, "Name, visit end time, and consent are required")
    valid_from = datetime.fromisoformat(data.get("valid_from") or utc_now().isoformat())
    valid_to = datetime.fromisoformat(data["valid_to"])
    if valid_to <= valid_from:
        raise HTTPException(400, "valid_to must be after valid_from")
    host_id = int(data["host_person_id"]) if data.get("host_person_id") else None
    host = db.get(Person, host_id) if host_id else None
    if host_id and not host:
        raise HTTPException(404, "Host employee not found")
    visitor = Visitor(
        full_name=name,
        phone=data.get("phone") or None,
        company=data.get("company") or None,
        host_name=host.full_name if host else None,
        host_person_id=host_id,
        visit_reason=data.get("visit_reason") or None,
        id_type=data.get("id_type") or None,
        id_number=data.get("id_number") or None,
        valid_from=valid_from,
        valid_to=valid_to,
        status="reserved",
        approval_status="pending",
        reservation_code=_new_code("VIS"),
        self_service_token=secrets.token_urlsafe(32),
        consent_accepted=1,
        source="self_service",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(visitor)
    db.flush()
    visitor.qr_token = _make_qr_token(visitor.id)
    _record_access(db, visitor, "self_service_reserved", None)
    db.commit()
    return {
        "id": visitor.id,
        "reservation_code": visitor.reservation_code,
        "approval_status": visitor.approval_status,
    }


@router.get("/self-service/options")
def self_service_options(db: Session = Depends(get_db)):
    hosts = db.query(Person).filter(
        Person.person_type == "employee",
        Person.full_name.isnot(None),
        Person.acs_active == 1,
    ).order_by(Person.full_name).limit(500).all()
    return {
        "hosts": [{"id": person.id, "name": person.full_name} for person in hosts],
        "groups": ["General", "Contractor", "Interview", "Delivery", "VIP"],
        "id_types": ["Passport", "National ID", "Driver License"],
    }


# ── QR code for visitor ───────────────────────────────────────────────────────

@router.get("/{visitor_id}/qr", response_class=Response)
def visitor_qr(
    visitor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    v = db.get(Visitor, visitor_id)
    if not v: raise HTTPException(404, "Visitor not found")

    try:
        import qrcode
    except ImportError:
        raise HTTPException(503, "qrcode not installed")

    qr_data = f"VISITOR_CHECKIN:{v.qr_token}"
    qr = qrcode.QRCode(version=2, error_correction=qrcode.constants.ERROR_CORRECT_M,
                       box_size=8, border=3)
    qr.add_data(qr_data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/png",
                    headers={"Content-Disposition": f'inline; filename="visitor_{visitor_id}_qr.png"'})


# ── QR scan → check-in / check-out ───────────────────────────────────────────

@router.post("/scan/{qr_token}")
def visitor_scan(
    qr_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    v = db.query(Visitor).filter(Visitor.qr_token == qr_token).first()
    if not v: raise HTTPException(404, "Invalid or unknown QR token")
    if v.approval_status != "approved":
        raise HTTPException(403, "Visitor reservation is not approved")
    matches = _watch_matches(db, v)
    if any(item["watch_type"] == "blocked" for item in matches):
        _record_access(db, v, "watchlist_blocked", current_user.id)
        db.commit()
        raise HTTPException(403, "Visitor is blocked by the watch list")

    now = utc_now()
    if v.valid_to < now:
        v.status = "expired"
        db.commit()
        raise HTTPException(403, "Visitor access has expired")
    if v.valid_from > now:
        raise HTTPException(403, f"Visitor access starts at {v.valid_from}")

    if not v.checked_in_at:
        v.checked_in_at = now
        v.status        = "active"
        action = "checked_in"
    else:
        v.checked_out_at = now
        v.status         = "completed"
        action = "checked_out"

    _record_access(db, v, action, current_user.id)
    v.updated_at = now
    db.commit()
    db.refresh(v)

    return {
        "ok":      True,
        "action":  action,
        "visitor": _serialize(v),
    }
