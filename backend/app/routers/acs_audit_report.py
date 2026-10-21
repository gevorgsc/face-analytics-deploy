"""Feature 10: Access Audit Compliance Report — who accessed what and when."""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.db import get_db
from app.models import AcsAccessEvent, AccessControlDevice, Person, User
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/audit-report", tags=["acs_audit_report"])


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("/summary")
def audit_summary(
    date_from: str = Query(None),
    date_to: str   = Query(None),
    person_id: int = Query(None),
    device_id: int = Query(None),
    event_type: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AcsAccessEvent).options(
        joinedload(AcsAccessEvent.person),
        joinedload(AcsAccessEvent.device),
    )
    if date_from:
        q = q.filter(AcsAccessEvent.created_at >= _parse_dt(date_from))
    if date_to:
        q = q.filter(AcsAccessEvent.created_at <= _parse_dt(date_to))
    if person_id:
        q = q.filter(AcsAccessEvent.person_id == person_id)
    if device_id:
        q = q.filter(AcsAccessEvent.device_id == device_id)
    if event_type:
        q = q.filter(AcsAccessEvent.event_type == event_type)

    events = q.order_by(AcsAccessEvent.created_at.desc()).limit(1000).all()

    rows = []
    for ev in events:
        rows.append({
            "id": ev.id,
            "created_at": ev.created_at,
            "device_name": ev.device.name if ev.device else None,
            "device_ip": ev.device.ip_address if ev.device else None,
            "door_no": ev.door_no,
            "person_id": ev.person_id,
            "person_name": ev.person.full_name if ev.person else None,
            "person_type": ev.person.person_type if ev.person else None,
            "card_number": ev.card_number,
            "event_type": ev.event_type,
            "verify_mode": ev.verify_mode,
            "direction": ev.direction,
            "denial_reason": ev.denial_reason,
        })

    granted = sum(1 for r in rows if r["event_type"] == "access_granted")
    denied  = sum(1 for r in rows if r["event_type"] in ("access_denied", "alarm"))
    unique_persons = len({r["person_id"] for r in rows if r["person_id"]})

    return {
        "total_events": len(rows),
        "granted": granted,
        "denied": denied,
        "unique_persons": unique_persons,
        "date_from": date_from,
        "date_to": date_to,
        "generated_at": utc_now(),
        "events": rows,
    }


@router.get("/export/csv")
def export_csv(
    date_from: str = Query(None),
    date_to: str   = Query(None),
    person_id: int = Query(None),
    device_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download audit data as CSV."""
    import csv, io
    data = audit_summary(
        date_from=date_from, date_to=date_to,
        person_id=person_id, device_id=device_id,
        db=db, current_user=current_user,
    )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "id", "created_at", "device_name", "door_no",
        "person_name", "person_type", "card_number",
        "event_type", "verify_mode", "direction", "denial_reason",
    ])
    writer.writeheader()
    for row in data["events"]:
        writer.writerow({k: row.get(k, "") for k in writer.fieldnames})

    output.seek(0)
    filename = f"acs_audit_{(date_from or 'all').replace('-', '')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/person/{person_id}/history")
def person_access_history(
    person_id: int,
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full access history for a specific person."""
    person = db.get(Person, person_id)
    if not person:
        from fastapi import HTTPException
        raise HTTPException(404, "Person not found")

    cutoff = utc_now() - timedelta(days=days)
    events = (
        db.query(AcsAccessEvent)
        .options(joinedload(AcsAccessEvent.device))
        .filter(
            AcsAccessEvent.person_id == person_id,
            AcsAccessEvent.created_at >= cutoff,
        )
        .order_by(AcsAccessEvent.created_at.desc())
        .limit(500).all()
    )

    return {
        "person_id": person_id,
        "person_name": person.full_name,
        "days": days,
        "total_events": len(events),
        "events": [
            {
                "id": ev.id,
                "created_at": ev.created_at,
                "device_name": ev.device.name if ev.device else None,
                "door_no": ev.door_no,
                "event_type": ev.event_type,
                "verify_mode": ev.verify_mode,
                "direction": ev.direction,
                "denial_reason": ev.denial_reason,
            }
            for ev in events
        ],
    }
