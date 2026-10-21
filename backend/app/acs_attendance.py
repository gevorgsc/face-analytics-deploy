"""
acs_attendance.py — Auto-create/update AttendanceRecord from ACS access events.

When an ACS access_granted event with direction='in' arrives → check-in.
When direction='out' arrives → check-out.
Called from acs_config.py poll_events and the ingest endpoint.
"""

import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from app.models import AttendanceRecord, AcsAccessEvent, Person

logger = logging.getLogger(__name__)

# Yerevan timezone offset (UTC+4)
YEREVAN_OFFSET = timedelta(hours=4)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _work_date(dt: datetime) -> str:
    """Return work-day date string in Yerevan time (YYYY-MM-DD)."""
    yerevan_dt = dt + YEREVAN_OFFSET
    return yerevan_dt.strftime("%Y-%m-%d")


def process_acs_event(db: Session, event: AcsAccessEvent) -> AttendanceRecord | None:
    """
    Check an ACS event and update AttendanceRecord if applicable.
    Returns the updated/created record, or None if not applicable.
    """
    if event.event_type != "access_granted":
        return None
    if not event.person_id:
        return None

    person = db.get(Person, event.person_id)
    if not person:
        return None

    # Only track employees (not VIP-only, not unknown)
    if person.person_type not in ("employee", "vip"):
        return None

    event_time = event.created_at or _utcnow()
    work_date = _work_date(event_time)

    record = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.person_id == event.person_id,
            AttendanceRecord.work_date == work_date,
        )
        .first()
    )

    direction = (event.direction or "").lower()
    if direction not in ("in", "out"):
        # No direction: check-out if already checked in today without check-out, otherwise check-in
        direction = "out" if (record and record.check_in_at and not record.check_out_at) else "in"

    if not record:
        record = AttendanceRecord(
            person_id    = event.person_id,
            work_date    = work_date,
            check_in_at  = event_time if direction == "in" else None,
            check_out_at = event_time if direction == "out" else None,
            status       = "present",
            is_manual    = 0,
            created_at   = _utcnow(),
            updated_at   = _utcnow(),
        )
        db.add(record)
    else:
        if not record.is_manual:
            if direction == "in":
                # Only update check-in if earlier than current
                if not record.check_in_at or event_time < record.check_in_at:
                    record.check_in_at = event_time
            elif direction == "out":
                # Always update check-out to latest
                if not record.check_out_at or event_time > record.check_out_at:
                    record.check_out_at = event_time

            # Recalculate work_minutes
            if record.check_in_at and record.check_out_at:
                delta = record.check_out_at - record.check_in_at
                record.work_minutes = max(0, int(delta.total_seconds() / 60))

            record.updated_at = _utcnow()

    try:
        db.commit()
        db.refresh(record)
        logger.debug(
            "acs_attendance: %s %s → %s (%s)",
            person.full_name, direction, work_date, record.status,
        )
        return record
    except Exception as exc:
        db.rollback()
        logger.warning("acs_attendance: commit failed: %s", exc)
        return None


def bulk_process_events(db: Session, events: list[AcsAccessEvent]) -> int:
    """Process a list of ACS events and update attendance. Returns count updated."""
    updated = 0
    for event in events:
        try:
            result = process_acs_event(db, event)
            if result:
                updated += 1
        except Exception as exc:
            logger.warning("acs_attendance: event %d failed: %s", event.id, exc)
    return updated
