"""
attendance_engine.py — Auto-create and update AttendanceRecord from FaceEvents.

Called from utils.process_faces_and_create_events after every face match.
Logic:
  - Only tracks registered (non-unknown) persons
  - One record per person per Yerevan calendar day
  - check_in_at  = first detection of the day
  - check_out_at = last  detection of the day (updated every sighting)
  - work_minutes = check_out - check_in (minutes); None if single sighting
  - status computed against the active AttendanceRule
"""

import logging
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

try:
    YEREVAN_TZ = ZoneInfo("Asia/Yerevan")
except Exception:
    YEREVAN_TZ = timezone(timedelta(hours=4))

# Attendance statuses
STATUS_PRESENT   = "present"
STATUS_LATE      = "late"
STATUS_ABSENT    = "absent"
STATUS_EARLY_EXIT= "early_exit"
STATUS_HALF_DAY  = "half_day"   # checked in but no check-out yet / very short day
STATUS_WEEKEND   = "weekend"
STATUS_HOLIDAY   = "holiday"
STATUS_MANUAL    = "manual"


def _yerevan_date_str(dt: datetime) -> str:
    """Convert a UTC datetime to a Yerevan YYYY-MM-DD string."""
    local = dt.astimezone(YEREVAN_TZ)
    return local.strftime("%Y-%m-%d")


def _yerevan_time(dt: datetime):
    """Return a time object in Yerevan TZ."""
    return dt.astimezone(YEREVAN_TZ).time()


def _get_active_rule(db: Session):
    """Return the first active AttendanceRule, or None."""
    from app.models import AttendanceRule
    return db.query(AttendanceRule).filter(AttendanceRule.is_active == 1).first()


def _compute_status(
    check_in_at: datetime | None,
    check_out_at: datetime | None,
    rule,
    work_date_str: str,
) -> str:
    """Derive attendance status from times and the active rule."""
    if rule is None:
        return STATUS_PRESENT if check_in_at else STATUS_ABSENT

    # Check if it's a working day
    try:
        d = date.fromisoformat(work_date_str)
        work_days = {int(x) for x in (rule.work_days or "1,2,3,4,5").split(",")}
        if d.isoweekday() not in work_days:
            return STATUS_WEEKEND
    except Exception:
        pass

    if not check_in_at:
        return STATUS_ABSENT

    from datetime import time as _time
    try:
        start_parts = [int(x) for x in (rule.work_start or "09:00").split(":")]
        end_parts   = [int(x) for x in (rule.work_end   or "18:00").split(":")]
        grace       = int(rule.grace_minutes or 0)
        work_start  = _time(start_parts[0], start_parts[1])
        work_end    = _time(end_parts[0],   end_parts[1])
    except Exception:
        return STATUS_PRESENT

    ci_time = _yerevan_time(check_in_at)
    grace_limit = (
        datetime.combine(date.today(), work_start) + timedelta(minutes=grace)
    ).time()

    is_late = ci_time > grace_limit

    if check_out_at:
        co_time = _yerevan_time(check_out_at)
        left_early = co_time < work_end
        if is_late and left_early:
            return STATUS_HALF_DAY
        if is_late:
            return STATUS_LATE
        if left_early:
            return STATUS_EARLY_EXIT
        return STATUS_PRESENT
    else:
        return STATUS_LATE if is_late else STATUS_PRESENT


def upsert_attendance_record(db: Session, person, event_dt: datetime) -> None:
    """
    Create or update the AttendanceRecord for (person, today).
    Called for every face detection of a registered person.
    Non-blocking: any exception is caught and logged.
    """
    try:
        from app.models import AttendanceRecord

        # Only track registered persons (employees, vip, blacklist — not unknowns)
        if person.person_type == "unknown" or not person.full_name:
            return

        work_date = _yerevan_date_str(event_dt)

        record = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.person_id == person.id,
                AttendanceRecord.work_date == work_date,
            )
            .first()
        )

        rule = _get_active_rule(db)
        now  = datetime.now(timezone.utc)

        if record is None:
            # First sighting today → create record
            status = _compute_status(event_dt, None, rule, work_date)
            record = AttendanceRecord(
                person_id    = person.id,
                work_date    = work_date,
                check_in_at  = event_dt,
                check_out_at = None,
                work_minutes = None,
                status       = status,
                is_manual    = 0,
                created_at   = now,
                updated_at   = now,
            )
            db.add(record)
        else:
            if record.is_manual:
                # Admin-set record — don't auto-override
                return

            # Update check_out_at to the latest sighting
            if not record.check_out_at or event_dt > record.check_out_at:
                record.check_out_at = event_dt

            # Update check_in_at if this is earlier (shouldn't happen but safety)
            if not record.check_in_at or event_dt < record.check_in_at:
                record.check_in_at = event_dt

            # Recalculate work_minutes
            if record.check_in_at and record.check_out_at:
                delta = record.check_out_at - record.check_in_at
                record.work_minutes = max(0, int(delta.total_seconds() / 60))

            record.status     = _compute_status(record.check_in_at, record.check_out_at, rule, work_date)
            record.updated_at = now

        db.flush()

    except Exception as e:
        logger.warning("attendance_engine error for person %s: %s", getattr(person, "id", "?"), e)
