"""Attendance rules router - work schedule config + daily report."""
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.models import AttendanceRule, FaceEvent, Person, User
from app.utils import yerevan_day_start_utc

logger = logging.getLogger(__name__)
router = APIRouter(tags=["attendance_rules"])

YEREVAN_OFFSET = timedelta(hours=4)  # UTC+4


def _serialize_rule(r: AttendanceRule) -> dict:
    return {
        "id":            r.id,
        "name":          r.name,
        "work_start":    r.work_start,
        "work_end":      r.work_end,
        "grace_minutes": r.grace_minutes,
        "work_days":     [int(d) for d in (r.work_days or "1,2,3,4,5").split(",") if d.strip()],
        "is_active":     bool(r.is_active),
        "created_at":    r.created_at,
    }


@router.get("/api/attendance/rules")
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [_serialize_rule(r) for r in db.query(AttendanceRule).all()]


@router.post("/api/attendance/rules")
def create_rule(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    days = data.get("work_days", [1, 2, 3, 4, 5])
    rule = AttendanceRule(
        name          = (data.get("name") or "Default Schedule").strip(),
        work_start    = data.get("work_start", "09:00"),
        work_end      = data.get("work_end",   "18:00"),
        grace_minutes = int(data.get("grace_minutes", 15)),
        work_days     = ",".join(str(d) for d in (days if isinstance(days, list) else [1,2,3,4,5])),
        is_active     = 1 if data.get("is_active", True) else 0,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _serialize_rule(rule)


@router.patch("/api/attendance/rules/{rule_id}")
def update_rule(
    rule_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rule = db.get(AttendanceRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    if "name"          in data: rule.name          = data["name"]
    if "work_start"    in data: rule.work_start     = data["work_start"]
    if "work_end"      in data: rule.work_end       = data["work_end"]
    if "grace_minutes" in data: rule.grace_minutes  = int(data["grace_minutes"])
    if "work_days"     in data:
        days = data["work_days"]
        rule.work_days = ",".join(str(d) for d in (days if isinstance(days, list) else []))
    if "is_active"     in data: rule.is_active      = 1 if data["is_active"] else 0
    db.commit()
    db.refresh(rule)
    return _serialize_rule(rule)


@router.delete("/api/attendance/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rule = db.get(AttendanceRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"ok": True}


@router.get("/api/attendance/daily-report")
def daily_report(
    report_date: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to today"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns attendance status for every registered employee on the given date.
    Statuses: present | late | absent | left_early | weekend
    """
    # Parse target date
    if report_date:
        try:
            target = date.fromisoformat(report_date)
        except ValueError:
            raise HTTPException(400, "Invalid date format, use YYYY-MM-DD")
    else:
        target = (datetime.now(timezone.utc) + YEREVAN_OFFSET).date()

    # Day-of-week: 1=Mon...7=Sun (ISO)
    day_iso = target.isoweekday()

    # Active rule (first found)
    rule = db.query(AttendanceRule).filter(AttendanceRule.is_active == 1).first()
    if not rule:
        return {"date": str(target), "rule": None, "rows": [], "summary": {}}

    work_days = [int(d) for d in (rule.work_days or "1,2,3,4,5").split(",") if d.strip()]
    is_workday = day_iso in work_days

    # Day window (Yerevan = UTC+4)
    day_start_utc = datetime(target.year, target.month, target.day,
                             0, 0, 0, tzinfo=timezone.utc) - YEREVAN_OFFSET
    day_end_utc   = day_start_utc + timedelta(hours=24)

    # Parse work hours в†’ datetime on target date (UTC)
    def _parse_hm(hm: str, base_date: date) -> datetime:
        h, m = map(int, hm.split(":"))
        local_dt = datetime(base_date.year, base_date.month, base_date.day, h, m,
                            tzinfo=timezone.utc) - YEREVAN_OFFSET
        return local_dt

    work_start_utc = _parse_hm(rule.work_start, target)
    work_end_utc   = _parse_hm(rule.work_end, target)
    late_threshold = work_start_utc + timedelta(minutes=rule.grace_minutes)

    # All registered employees
    employees = (
        db.query(Person)
        .filter(
            Person.source != "acs",
            Person.person_type == "employee",
            Person.full_name.isnot(None),
        )
        .all()
    )

    # Events for this day for all employees
    person_ids = [e.id for e in employees]
    events_today = (
        db.query(FaceEvent)
        .filter(
            FaceEvent.source == "face_analytics",
            FaceEvent.person_id.in_(person_ids),
            FaceEvent.created_at >= day_start_utc,
            FaceEvent.created_at <  day_end_utc,
        )
        .order_by(FaceEvent.created_at)
        .all()
    )

    # Group events by person
    by_person: dict = {e.id: [] for e in employees}
    for ev in events_today:
        if ev.person_id in by_person:
            by_person[ev.person_id].append(ev)

    rows = []
    summary = {"present": 0, "late": 0, "absent": 0, "left_early": 0, "weekend": 0}

    for emp in employees:
        evs = by_person[emp.id]

        if not is_workday:
            status = "weekend"
            summary["weekend"] += 1
            rows.append({
                "person_id":   emp.id,
                "full_name":   emp.full_name,
                "department":  emp.department,
                "status":      status,
                "first_in":    None,
                "last_event":  None,
            })
            continue

        # First IN event
        in_events  = [e for e in evs if e.direction in ("in", None, "both")]
        out_events = [e for e in evs if e.direction == "out"]

        first_in  = in_events[0].created_at  if in_events  else None
        last_out  = out_events[-1].created_at if out_events else None

        if not first_in and not evs:
            status = "absent"
            summary["absent"] += 1
        elif first_in and first_in > late_threshold:
            status = "late"
            summary["late"] += 1
        elif last_out and last_out < work_end_utc and (not evs or evs[-1].direction == "out"):
            status = "left_early"
            summary["left_early"] += 1
        else:
            status = "present"
            summary["present"] += 1

        rows.append({
            "person_id":  emp.id,
            "full_name":  emp.full_name,
            "department": emp.department,
            "status":     status,
            "first_in":   first_in,
            "last_event": (last_out or (evs[-1].created_at if evs else None)),
        })

    rows.sort(key=lambda r: (
        {"absent": 0, "late": 1, "left_early": 2, "present": 3, "weekend": 4}.get(r["status"], 5)
    ))

    return {
        "date":    str(target),
        "rule":    _serialize_rule(rule),
        "rows":    rows,
        "summary": summary,
        "is_workday": is_workday,
    }
