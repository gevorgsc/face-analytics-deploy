"""Feature 7: Access Request Workflow — request, approve, reject door access."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import AcsAccessRequest, AccessLevel, AccessLevelMember, Person, User
from app.utils import utc_now

import logging
import os
import threading

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/acs/access-requests", tags=["acs_access_requests"])


def _notify_request_decision(req, decision: str, note: str | None) -> None:
    """Send email to the person if they have an email address on record."""
    person = req.person if req.person else None
    if not person:
        return
    email = getattr(person, "email", None)
    if not email:
        return

    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_user = os.getenv("SMTP_USER", "")
    if not smtp_host or not smtp_user:
        return  # SMTP not configured

    level_name = req.access_level.name if req.access_level else "requested level"
    icon       = "✅" if decision == "approved" else "❌"
    subject    = f"{icon} Access Request {decision.capitalize()} — {level_name}"
    body_lines = [
        f"Hello {person.full_name or 'there'},",
        "",
        f"Your access request for '{level_name}' has been {decision}.",
    ]
    if note:
        body_lines += ["", f"Reviewer note: {note}"]
    body_lines += ["", "— Access Controller System"]
    body = "\n".join(body_lines)

    def _send():
        try:
            from app.alert_engine import _send_email
            cfg = {
                "host":      smtp_host,
                "port":      int(os.getenv("SMTP_PORT", "587")),
                "username":  smtp_user,
                "password":  os.getenv("SMTP_PASS", ""),
                "from_addr": os.getenv("SMTP_FROM", smtp_user),
                "use_tls":   os.getenv("SMTP_TLS", "1") == "1",
                "to_addrs":  [email],
            }
            ok, msg = _send_email(cfg, subject, body)
            if not ok:
                logger.warning("Access request notification failed: %s", msg)
        except Exception as exc:
            logger.warning("Access request notification error: %s", exc)

    threading.Thread(target=_send, daemon=True).start()


def _req_out(r: AcsAccessRequest) -> dict:
    return {
        "id": r.id,
        "person_id": r.person_id,
        "person_name": r.person.full_name if r.person else None,
        "access_level_id": r.access_level_id,
        "access_level_name": r.access_level.name if r.access_level else None,
        "door_rules": r.door_rules,
        "reason": r.reason,
        "valid_from": r.valid_from,
        "valid_to": r.valid_to,
        "status": r.status,
        "reviewed_by": r.reviewed_by,
        "reviewed_at": r.reviewed_at,
        "reviewer_note": r.reviewer_note,
        "created_by": r.created_by,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


# ── List / filter ─────────────────────────────────────────────────────────────

@router.get("")
def list_requests(
    status: str = Query(None),
    person_id: int = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AcsAccessRequest).options(
        joinedload(AcsAccessRequest.person),
        joinedload(AcsAccessRequest.access_level),
    )
    if status:
        q = q.filter(AcsAccessRequest.status == status)
    if person_id:
        q = q.filter(AcsAccessRequest.person_id == person_id)
    reqs = q.order_by(AcsAccessRequest.created_at.desc()).limit(limit).all()
    return [_req_out(r) for r in reqs]


@router.get("/summary")
def requests_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import func
    rows = (
        db.query(AcsAccessRequest.status, func.count(AcsAccessRequest.id))
        .group_by(AcsAccessRequest.status)
        .all()
    )
    return {status: count for status, count in rows}


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("")
def create_request(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.get("person_id"):
        raise HTTPException(400, "person_id is required")
    person = db.get(Person, data["person_id"])
    if not person:
        raise HTTPException(404, "Person not found")

    req = AcsAccessRequest(
        person_id=int(data["person_id"]),
        access_level_id=data.get("access_level_id"),
        door_rules=data.get("door_rules"),
        reason=data.get("reason"),
        valid_from=data.get("valid_from"),
        valid_to=data.get("valid_to"),
        status="pending",
        created_by=current_user.id,
    )
    db.add(req); db.commit()
    req = db.query(AcsAccessRequest).options(
        joinedload(AcsAccessRequest.person),
        joinedload(AcsAccessRequest.access_level),
    ).filter(AcsAccessRequest.id == req.id).first()
    return _req_out(req)


# ── Approve ───────────────────────────────────────────────────────────────────

@router.post("/{req_id}/approve")
def approve_request(
    req_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    req = db.query(AcsAccessRequest).options(
        joinedload(AcsAccessRequest.person),
        joinedload(AcsAccessRequest.access_level),
    ).filter(AcsAccessRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "Request not found")
    if req.status != "pending":
        raise HTTPException(409, f"Request is already {req.status}")

    req.status        = "approved"
    req.reviewed_by   = current_user.id
    req.reviewed_at   = utc_now()
    req.reviewer_note = data.get("note")

    # Auto-add person to access level if specified
    if req.access_level_id:
        existing = db.query(AccessLevelMember).filter(
            AccessLevelMember.access_level_id == req.access_level_id,
            AccessLevelMember.person_id == req.person_id,
        ).first()
        if not existing:
            member = AccessLevelMember(
                access_level_id=req.access_level_id,
                person_id=req.person_id,
                valid_from=req.valid_from,
                valid_to=req.valid_to,
            )
            db.add(member)

    db.commit(); db.refresh(req)

    # Send email notification to person if they have an email address
    _notify_request_decision(req, "approved", data.get("note"))

    return _req_out(req)


# ── Reject ────────────────────────────────────────────────────────────────────

@router.post("/{req_id}/reject")
def reject_request(
    req_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    req = db.query(AcsAccessRequest).options(
        joinedload(AcsAccessRequest.person),
        joinedload(AcsAccessRequest.access_level),
    ).filter(AcsAccessRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "Request not found")
    if req.status != "pending":
        raise HTTPException(409, f"Request is already {req.status}")

    req.status        = "rejected"
    req.reviewed_by   = current_user.id
    req.reviewed_at   = utc_now()
    req.reviewer_note = data.get("note")
    db.commit(); db.refresh(req)

    _notify_request_decision(req, "rejected", data.get("note"))

    return _req_out(req)


@router.delete("/{req_id}")
def delete_request(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    req = db.get(AcsAccessRequest, req_id)
    if not req:
        raise HTTPException(404, "Request not found")
    db.delete(req); db.commit()
    return {"ok": True}
