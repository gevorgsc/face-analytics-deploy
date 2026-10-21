"""
attendance_pro.py — Professional attendance API.

Endpoints:
  GET  /api/attd/today              — today's summary (present/absent/late)
  GET  /api/attd/records            — records for a date range
  GET  /api/attd/report/{date}      — full daily report for one date
  POST /api/attd/manual             — admin: manual check-in or check-out
  DELETE /api/attd/{record_id}      — admin: delete record (resets to auto)
  PATCH  /api/attd/{record_id}      — admin: edit record
  GET  /api/persons/{id}/qr         — generate QR PNG for person
  POST /api/qr/scan/{token}         — scan QR → check-in / check-out
"""

import base64
import hashlib
import hmac
import io
import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import (
    AcsAccessEvent,
    AccessControlDevice,
    AttendanceBreak,
    AttendanceGroup,
    AttendanceRecord,
    AttendanceRequest,
    AttendanceRule,
    AttendanceSchedule,
    AttendanceShift,
    Person,
    User,
)
from app.attendance_engine import (
    YEREVAN_TZ, _yerevan_date_str, _compute_status, _get_active_rule, upsert_attendance_record,
)
from app.utils import add_audit_log, utc_now, sign_media_fields

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/attd", tags=["attendance_pro"])

QR_SECRET = os.getenv("SECRET_KEY", "change-me")


# ── Request body schemas ──────────────────────────────────────────────────────

class _ManualAttendanceBody(BaseModel):
    person_id: int
    work_date: Optional[str] = None
    action: str
    time: Optional[str] = None
    note: Optional[str] = ""


class _EditRecordBody(BaseModel):
    note: Optional[str] = None
    status: Optional[str] = None
    check_in_at: Optional[str] = None
    check_out_at: Optional[str] = None


class _QrScanBody(BaseModel):
    person_id: int
    action: Optional[str] = "auto"


class _CreateShiftBody(BaseModel):
    name: str
    work_start: Optional[str] = "09:00"
    work_end: Optional[str] = "18:00"
    break_minutes: Optional[int] = 0
    calculation_mode: Optional[str] = "first_last"
    overtime_enabled: Optional[bool] = False
    overtime_after_minutes: Optional[int] = 0
    min_punch_interval: Optional[int] = 0
    grace_minutes: Optional[int] = 0
    early_minutes: Optional[int] = 0
    minimum_minutes: Optional[int] = 0
    work_days: Optional[list] = None
    is_overnight: Optional[bool] = False
    is_active: Optional[bool] = True


class _UpdateShiftBody(BaseModel):
    name: Optional[str] = None
    work_start: Optional[str] = None
    work_end: Optional[str] = None
    break_minutes: Optional[int] = None
    grace_minutes: Optional[int] = None
    early_minutes: Optional[int] = None
    minimum_minutes: Optional[int] = None
    overtime_after_minutes: Optional[int] = None
    min_punch_interval: Optional[int] = None
    calculation_mode: Optional[str] = None
    overtime_enabled: Optional[bool] = None
    work_days: Optional[list] = None
    is_overnight: Optional[bool] = None
    is_active: Optional[bool] = None


class _CreateBreakBody(BaseModel):
    name: str
    start_time: str
    end_time: str
    paid: Optional[bool] = False
    is_active: Optional[bool] = True


class _CreateGroupBody(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#3B82F6"
    shift_id: Optional[int] = None
    is_active: Optional[bool] = True


class _UpdateGroupBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    shift_id: Optional[int] = None
    is_active: Optional[bool] = None


class _CreateScheduleBody(BaseModel):
    group_id: Optional[int] = None
    shift_id: Optional[int] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    person_ids: Optional[list] = None
    person_id: Optional[int] = None


class _CreateRequestBody(BaseModel):
    person_id: int
    request_type: str
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    correction_in: Optional[str] = None
    correction_out: Optional[str] = None
    reason: Optional[str] = None


class _ReviewRequestBody(BaseModel):
    decision: str
    reviewer_note: Optional[str] = None


class _RecalculateBody(BaseModel):
    date_from: str
    date_to: str
    person_ids: Optional[list] = None


def _attendance_people_query(db: Session):
    return db.query(Person).filter(
        Person.person_type == "employee",
        Person.full_name.isnot(None),
        or_(Person.source != "acs", Person.acs_active == 1),
    )


def _effective_attendance_rule(db: Session, person_id: int, work_date: str):
    """Single-person lookup — prefer _bulk_effective_rules for batch operations."""
    schedule = (
        db.query(AttendanceSchedule)
        .options(joinedload(AttendanceSchedule.shift))
        .filter(
            AttendanceSchedule.person_id == person_id,
            AttendanceSchedule.is_active == 1,
            AttendanceSchedule.valid_from <= work_date,
            or_(AttendanceSchedule.valid_to.is_(None), AttendanceSchedule.valid_to >= work_date),
        )
        .order_by(AttendanceSchedule.valid_from.desc())
        .first()
    )
    if schedule and schedule.shift and schedule.shift.is_active:
        return schedule.shift
    return _get_active_rule(db)


def _bulk_effective_rules(db: Session, person_ids: list, work_date: str) -> dict:
    """
    Preload attendance rules for many persons in ONE query instead of N.
    Returns {person_id: shift_or_rule}.

    Replaces the N+1 pattern:
        for emp in employees:
            rule = _effective_attendance_rule(db, emp.id, today)  # ← 1 query each
    with:
        rules_map = _bulk_effective_rules(db, [emp.id for emp in employees], today)
        for emp in employees:
            rule = rules_map[emp.id]  # ← O(1), no DB call
    """
    if not person_ids:
        return {}

    schedules = (
        db.query(AttendanceSchedule)
        .options(joinedload(AttendanceSchedule.shift))
        .filter(
            AttendanceSchedule.person_id.in_(person_ids),
            AttendanceSchedule.is_active == 1,
            AttendanceSchedule.valid_from <= work_date,
            or_(AttendanceSchedule.valid_to.is_(None), AttendanceSchedule.valid_to >= work_date),
        )
        .order_by(AttendanceSchedule.valid_from.desc())
        .all()
    )

    # Keep the latest schedule per person (query is already ordered desc)
    best: dict = {}
    for sched in schedules:
        if sched.person_id not in best:
            best[sched.person_id] = sched

    default_rule = _get_active_rule(db)
    result = {}
    for pid in person_ids:
        sched = best.get(pid)
        result[pid] = (
            sched.shift
            if sched and sched.shift and sched.shift.is_active
            else default_rule
        )
    return result


# ── helpers ──────────────────────────────────────────────────────────────────

def _today_yerevan() -> str:
    return datetime.now(YEREVAN_TZ).strftime("%Y-%m-%d")


def _sign_qr(person_id: int) -> str:
    msg = f"qr:{person_id}".encode()
    return hmac.new(QR_SECRET.encode(), msg, hashlib.sha256).hexdigest()[:32]


def _verify_qr(person_id: int, token: str) -> bool:
    return hmac.compare_digest(_sign_qr(person_id), token)


def _fmt_minutes(mins: int | None) -> str | None:
    if mins is None:
        return None
    h, m = divmod(abs(mins), 60)
    return f"{h:02d}:{m:02d}"


def _serialize_record(r: AttendanceRecord) -> dict:
    p = r.person
    return {
        "id":           r.id,
        "person_id":    r.person_id,
        "person_name":  p.full_name if p else None,
        "person_type":  p.person_type if p else None,
        "department":   p.department if p else None,
        "card_number":  p.card_number if p else None,
        "preview_image": sign_media_fields({"preview_image": p.preview_image if p else None})["preview_image"],
        "work_date":    r.work_date,
        "check_in_at":  r.check_in_at,
        "check_out_at": r.check_out_at,
        "work_minutes": r.work_minutes,
        "work_hours":   _fmt_minutes(r.work_minutes),
        "break_minutes": r.break_minutes or 0,
        "overtime_minutes": r.overtime_minutes or 0,
        "overtime_hours": _fmt_minutes(r.overtime_minutes or 0),
        "calculation_version": r.calculation_version or 1,
        "status":       r.status,
        "is_manual":    bool(r.is_manual),
        "note":         r.note,
        "updated_at":   r.updated_at,
    }


def _parse_days(value) -> str:
    days = value if isinstance(value, list) else [1, 2, 3, 4, 5]
    normalized = sorted({int(day) for day in days if 1 <= int(day) <= 7})
    if not normalized:
        raise HTTPException(400, "At least one work day is required")
    return ",".join(str(day) for day in normalized)


def _validate_hhmm(value: str, field: str) -> str:
    try:
        datetime.strptime(value, "%H:%M")
    except (TypeError, ValueError):
        raise HTTPException(400, f"{field} must use HH:MM format")
    return value


def _serialize_shift(shift: AttendanceShift) -> dict:
    return {
        "id": shift.id,
        "name": shift.name,
        "work_start": shift.work_start,
        "work_end": shift.work_end,
        "break_minutes": shift.break_minutes,
        "calculation_mode": shift.calculation_mode,
        "overtime_enabled": bool(shift.overtime_enabled),
        "overtime_after_minutes": shift.overtime_after_minutes,
        "min_punch_interval": shift.min_punch_interval,
        "grace_minutes": shift.grace_minutes,
        "early_minutes": shift.early_minutes,
        "minimum_minutes": shift.minimum_minutes,
        "work_days": [int(day) for day in (shift.work_days or "").split(",") if day],
        "is_overnight": bool(shift.is_overnight),
        "is_active": bool(shift.is_active),
    }


def _recalculate_record(record: AttendanceRecord, rule) -> None:
    record.calculation_version = (record.calculation_version or 0) + 1
    record.break_minutes = 0
    record.overtime_minutes = 0
    if record.check_in_at and record.check_out_at:
        gross_minutes = max(0, int((record.check_out_at - record.check_in_at).total_seconds() / 60))
        scheduled_break = max(0, int(getattr(rule, "break_minutes", 0) or 0))
        record.break_minutes = min(gross_minutes, scheduled_break)
        record.work_minutes = max(0, gross_minutes - record.break_minutes)
        if bool(getattr(rule, "overtime_enabled", False)):
            threshold = max(0, int(getattr(rule, "minimum_minutes", 0) or 0))
            threshold += max(0, int(getattr(rule, "overtime_after_minutes", 0) or 0))
            record.overtime_minutes = max(0, record.work_minutes - threshold)
    else:
        record.work_minutes = None
    record.status = _compute_status(
        record.check_in_at, record.check_out_at, rule, record.work_date
    )


def _serialize_group(group: AttendanceGroup, member_count: int = 0) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "color": group.color,
        "shift_id": group.shift_id,
        "shift_name": group.shift.name if group.shift else None,
        "member_count": member_count,
        "is_active": bool(group.is_active),
    }


def _serialize_schedule(schedule: AttendanceSchedule) -> dict:
    return {
        "id": schedule.id,
        "person_id": schedule.person_id,
        "person_name": schedule.person.full_name if schedule.person else None,
        "department": schedule.person.department if schedule.person else None,
        "group_id": schedule.group_id,
        "group_name": schedule.group.name if schedule.group else None,
        "shift_id": schedule.shift_id,
        "shift_name": schedule.shift.name if schedule.shift else None,
        "valid_from": schedule.valid_from,
        "valid_to": schedule.valid_to,
        "is_active": bool(schedule.is_active),
    }


def _serialize_request(item: AttendanceRequest) -> dict:
    return {
        "id": item.id,
        "person_id": item.person_id,
        "person_name": item.person.full_name if item.person else None,
        "department": item.person.department if item.person else None,
        "request_type": item.request_type,
        "date_from": item.date_from,
        "date_to": item.date_to,
        "start_time": item.start_time,
        "end_time": item.end_time,
        "correction_in": item.correction_in,
        "correction_out": item.correction_out,
        "reason": item.reason,
        "status": item.status,
        "reviewer_note": item.reviewer_note,
        "created_at": item.created_at,
        "reviewed_at": item.reviewed_at,
    }


# ── Today summary ─────────────────────────────────────────────────────────────

@router.get("/today")
def today_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns today's attendance summary.
    Lists all registered employees with their status for today.
    Those not detected at all are marked 'absent'.
    """
    today = _today_yerevan()
    employees = _attendance_people_query(db).order_by(Person.full_name).all()

    records_today = {
        r.person_id: r
        for r in db.query(AttendanceRecord)
        .filter(AttendanceRecord.work_date == today)
        .all()
    }

    # Preload all rules in ONE query instead of N (N+1 fix)
    person_ids = [emp.id for emp in employees]
    rules_map  = _bulk_effective_rules(db, person_ids, today)

    result = []
    counts = {"present": 0, "late": 0, "absent": 0, "early_exit": 0,
              "half_day": 0, "weekend": 0, "holiday": 0}

    for emp in employees:
        rule = rules_map.get(emp.id)
        rec = records_today.get(emp.id)
        if rec:
            status      = rec.status or "present"
            check_in    = rec.check_in_at
            check_out   = rec.check_out_at
            work_minutes= rec.work_minutes
            is_manual   = bool(rec.is_manual)
            note        = rec.note
            rec_id      = rec.id
        else:
            status       = _compute_status(None, None, rule, today)
            check_in     = None
            check_out    = None
            work_minutes = None
            is_manual    = False
            note         = None
            rec_id       = None

        counts[status] = counts.get(status, 0) + 1

        result.append(sign_media_fields({
            "record_id":    rec_id,
            "person_id":    emp.id,
            "person_name":  emp.full_name,
            "department":   emp.department,
            "card_number":  emp.card_number,
            "preview_image": emp.preview_image,
            "status":       status,
            "check_in_at":  check_in,
            "check_out_at": check_out,
            "work_minutes": work_minutes,
            "work_hours":   _fmt_minutes(work_minutes),
            "is_manual":    is_manual,
            "note":         note,
        }))

    return {
        "date":    today,
        "summary": counts,
        "total":   len(employees),
        "records": result,
    }


# ── Records list ──────────────────────────────────────────────────────────────

@router.get("/records")
def list_records(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to:   Optional[str] = Query(None, description="YYYY-MM-DD"),
    person_id: Optional[int] = Query(None),
    status:    Optional[str] = Query(None),
    limit:     int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today  = _today_yerevan()
    d_from = date_from or today
    d_to   = date_to   or today

    q = (
        db.query(AttendanceRecord)
        .options(joinedload(AttendanceRecord.person))
        .filter(AttendanceRecord.work_date >= d_from,
                AttendanceRecord.work_date <= d_to)
    )
    if person_id:
        q = q.filter(AttendanceRecord.person_id == person_id)
    if status:
        q = q.filter(AttendanceRecord.status == status)

    records = q.order_by(AttendanceRecord.work_date.desc(),
                         AttendanceRecord.check_in_at.asc()).limit(limit).all()
    return [_serialize_record(r) for r in records]


# ── Full daily report ─────────────────────────────────────────────────────────

@router.get("/report/{report_date}")
def daily_report(
    report_date: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employees = _attendance_people_query(db).order_by(Person.full_name).all()
    records = {
        r.person_id: r
        for r in db.query(AttendanceRecord)
        .options(joinedload(AttendanceRecord.person))
        .filter(AttendanceRecord.work_date == report_date)
        .all()
    }

    # Preload all rules in ONE query (N+1 fix)
    report_person_ids = [emp.id for emp in employees]
    report_rules_map  = _bulk_effective_rules(db, report_person_ids, report_date)

    rows = []
    for emp in employees:
        rule = report_rules_map.get(emp.id)
        rec = records.get(emp.id)
        if rec:
            rows.append(_serialize_record(rec))
        else:
            status = _compute_status(None, None, rule, report_date)
            rows.append(sign_media_fields({
                "record_id":    None,
                "person_id":    emp.id,
                "person_name":  emp.full_name,
                "department":   emp.department,
                "card_number":  emp.card_number,
                "preview_image": emp.preview_image,
                "status":       status,
                "check_in_at":  None,
                "check_out_at": None,
                "work_minutes": None,
                "work_hours":   None,
                "is_manual":    False,
                "note":         None,
            }))

    counts = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    total_work = sum(r["work_minutes"] or 0 for r in rows if r["work_minutes"])
    avg_work = round(total_work / max(1, sum(1 for r in rows if r["work_minutes"])), 1)

    return {
        "date":        report_date,
        "summary":     counts,
        "total":       len(employees),
        "avg_work_min": avg_work,
        "records":     rows,
    }


# ── Manual check-in / check-out ───────────────────────────────────────────────

@router.post("/manual")
def manual_attendance(
    body: _ManualAttendanceBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """Admin or operator manually sets a check-in or check-out for a person."""
    person_id  = body.person_id
    work_date  = body.work_date or _today_yerevan()
    action     = body.action            # "check_in" | "check_out" | "absent" | "holiday"
    time_str   = body.time              # "HH:MM" in Yerevan time, optional
    note       = body.note or ""

    if not person_id:
        raise HTTPException(400, "person_id required")
    if action not in {"check_in", "check_out", "absent", "holiday", "present"}:
        raise HTTPException(400, "action must be: check_in | check_out | absent | holiday | present")

    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    # Parse the time if provided
    event_dt = None
    if time_str and action in {"check_in", "check_out"}:
        try:
            h, m = [int(x) for x in time_str.split(":")]
            d = date.fromisoformat(work_date)
            local_dt = datetime(d.year, d.month, d.day, h, m, tzinfo=YEREVAN_TZ)
            event_dt = local_dt.astimezone(timezone.utc)
        except Exception:
            raise HTTPException(400, "time must be HH:MM format")
    else:
        event_dt = utc_now()

    rule = _effective_attendance_rule(db, person_id, work_date)
    rec = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.person_id == person_id,
                AttendanceRecord.work_date == work_date)
        .first()
    )

    now = utc_now()
    if rec is None:
        rec = AttendanceRecord(
            person_id  = person_id,
            work_date  = work_date,
            is_manual  = 1,
            note       = note,
            created_at = now,
            updated_at = now,
        )
        db.add(rec)

    rec.is_manual  = 1
    rec.note       = note
    rec.updated_at = now

    if action == "check_in":
        rec.check_in_at = event_dt
    elif action == "check_out":
        rec.check_out_at = event_dt
    elif action in {"absent", "holiday"}:
        rec.check_in_at  = None
        rec.check_out_at = None
        rec.work_minutes = None
        rec.status       = action
        db.commit()
        return {"ok": True, "status": action}
    elif action == "present":
        rec.status = "present"

    _recalculate_record(rec, rule)
    db.commit()
    db.refresh(rec)

    add_audit_log(db, current_user, "ATTENDANCE_MANUAL", "attendance_record", rec.id,
                  f"Manual {action} for {person.full_name} on {work_date}")

    return {"ok": True, "record": _serialize_record(rec)}


# ── Edit / delete record ──────────────────────────────────────────────────────

@router.patch("/{record_id}")
def edit_record(
    record_id: int,
    body: _EditRecordBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    rec = db.get(AttendanceRecord, record_id)
    if not rec:
        raise HTTPException(404, "Record not found")

    rule = _effective_attendance_rule(db, rec.person_id, rec.work_date)
    if "note"   in body.model_fields_set: rec.note   = body.note
    if "status" in body.model_fields_set: rec.status = body.status
    if body.check_in_at:
        rec.check_in_at  = datetime.fromisoformat(body.check_in_at)
    if body.check_out_at:
        rec.check_out_at = datetime.fromisoformat(body.check_out_at)

    rec.is_manual  = 1
    rec.updated_at = utc_now()
    if "status" not in body.model_fields_set:
        _recalculate_record(rec, rule)

    db.commit()
    db.refresh(rec)
    db.refresh(rec)

    return {"ok": True, "record": _serialize_record(rec)}


@router.delete("/{record_id}")
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rec = db.get(AttendanceRecord, record_id)
    if not rec:
        raise HTTPException(404, "Record not found")
    db.delete(rec)
    db.commit()
    return {"ok": True}


# ── QR code generation ────────────────────────────────────────────────────────

@router.get("/qr/{person_id}", response_class=Response)
def person_qr(
    person_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a signed QR code PNG for the person. Scan to check-in/out."""
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    try:
        import qrcode
        from qrcode.image.styledpil import StyledPilImage
    except ImportError:
        raise HTTPException(503, "qrcode library not installed. Run: pip install qrcode[pil]")

    token    = _sign_qr(person_id)
    qr_data  = f"FACE_CHECKIN:{person_id}:{token}"

    qr = qrcode.QRCode(version=2, error_correction=qrcode.constants.ERROR_CORRECT_M,
                       box_size=8, border=3)
    qr.add_data(qr_data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return Response(content=buf.read(), media_type="image/png",
                    headers={"Content-Disposition": f'inline; filename="qr_{person_id}.png"'})


# ── QR scan endpoint ──────────────────────────────────────────────────────────

@router.post("/qr/scan/{token}")
def qr_scan(
    token: str,
    body: _QrScanBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """
    Process a scanned QR token.
    body: { "person_id": int, "action": "check_in" | "check_out" | "auto" }
    auto = check_in if not checked in yet today, else check_out.
    """
    person_id = body.person_id
    if not _verify_qr(person_id, token):
        raise HTTPException(403, "Invalid QR token")

    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    today = _today_yerevan()
    rec = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.person_id == person_id,
                AttendanceRecord.work_date == today)
        .first()
    )

    action = body.action
    if action == "auto":
        action = "check_out" if (rec and rec.check_in_at) else "check_in"

    now = utc_now()
    upsert_attendance_record(db, person, now)
    db.commit()

    rec = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.person_id == person_id,
                AttendanceRecord.work_date == today)
        .first()
    )

    return {
        "ok":          True,
        "action":      action,
        "person_id":   person_id,
        "person_name": person.full_name,
        "status":      rec.status if rec else "unknown",
        "check_in_at": rec.check_in_at if rec else None,
        "check_out_at":rec.check_out_at if rec else None,
        "work_hours":  _fmt_minutes(rec.work_minutes if rec else None),
    }


# ── Monthly stats per person ──────────────────────────────────────────────────

@router.get("/person/{person_id}/monthly")
def person_monthly(
    person_id: int,
    year:  int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    month_str = f"{year:04d}-{month:02d}"
    records = (
        db.query(AttendanceRecord)
        .options(joinedload(AttendanceRecord.person))
        .filter(
            AttendanceRecord.person_id == person_id,
            AttendanceRecord.work_date.like(f"{month_str}-%"),
        )
        .order_by(AttendanceRecord.work_date)
        .all()
    )

    total_work = sum(r.work_minutes or 0 for r in records)
    counts = {}
    for r in records:
        counts[r.status] = counts.get(r.status, 0) + 1

    return {
        "person_id":   person_id,
        "person_name": person.full_name,
        "department":  person.department,
        "month":       month_str,
        "total_work_minutes": total_work,
        "total_work_hours":   _fmt_minutes(total_work),
        "status_counts":      counts,
        "records":     [_serialize_record(r) for r in records],
    }


# -- Attendance administration ------------------------------------------------

@router.get("/people")
def attendance_people(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [
        {
            "id": person.id,
            "employee_no": person.employee_no,
            "full_name": person.full_name,
            "department": person.department,
        }
        for person in _attendance_people_query(db).order_by(Person.full_name).all()
    ]


@router.get("/shifts")
def list_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [_serialize_shift(item) for item in db.query(AttendanceShift).order_by(AttendanceShift.name).all()]


@router.post("/shifts")
def create_shift(
    body: _CreateShiftBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Shift name is required")
    if db.query(AttendanceShift).filter(AttendanceShift.name.ilike(name)).first():
        raise HTTPException(409, "Shift name already exists")
    shift = AttendanceShift(
        name=name,
        work_start=_validate_hhmm(body.work_start or "09:00", "work_start"),
        work_end=_validate_hhmm(body.work_end or "18:00", "work_end"),
        break_minutes=max(0, body.break_minutes or 0),
        calculation_mode=body.calculation_mode or "first_last",
        overtime_enabled=1 if body.overtime_enabled else 0,
        overtime_after_minutes=max(0, body.overtime_after_minutes or 0),
        min_punch_interval=max(0, body.min_punch_interval or 0),
        grace_minutes=max(0, body.grace_minutes or 0),
        early_minutes=max(0, body.early_minutes or 0),
        minimum_minutes=max(0, body.minimum_minutes or 0),
        work_days=_parse_days(body.work_days),
        is_overnight=1 if body.is_overnight else 0,
        is_active=1 if body.is_active else 0,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return _serialize_shift(shift)


@router.patch("/shifts/{shift_id}")
def update_shift(
    shift_id: int,
    body: _UpdateShiftBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    shift = db.get(AttendanceShift, shift_id)
    if not shift:
        raise HTTPException(404, "Shift not found")
    if "name" in body.model_fields_set:
        name = (body.name or "").strip()
        duplicate = db.query(AttendanceShift).filter(
            AttendanceShift.name.ilike(name),
            AttendanceShift.id != shift_id,
        ).first()
        if not name or duplicate:
            raise HTTPException(409 if duplicate else 400, "Shift name is invalid or already exists")
        shift.name = name
    for field in ("work_start", "work_end"):
        if field in body.model_fields_set:
            setattr(shift, field, _validate_hhmm(getattr(body, field), field))
    for field in (
        "break_minutes", "grace_minutes", "early_minutes", "minimum_minutes",
        "overtime_after_minutes", "min_punch_interval",
    ):
        if field in body.model_fields_set:
            setattr(shift, field, max(0, int(getattr(body, field) or 0)))
    if "calculation_mode" in body.model_fields_set:
        if body.calculation_mode not in {"first_last", "paired_punches"}:
            raise HTTPException(400, "Unsupported calculation mode")
        shift.calculation_mode = body.calculation_mode
    if "overtime_enabled" in body.model_fields_set:
        shift.overtime_enabled = 1 if body.overtime_enabled else 0
    if "work_days" in body.model_fields_set:
        shift.work_days = _parse_days(body.work_days)
    if "is_overnight" in body.model_fields_set:
        shift.is_overnight = 1 if body.is_overnight else 0
    if "is_active" in body.model_fields_set:
        shift.is_active = 1 if body.is_active else 0
    db.commit()
    db.refresh(shift)
    return _serialize_shift(shift)


@router.delete("/shifts/{shift_id}")
def delete_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    shift = db.get(AttendanceShift, shift_id)
    if not shift:
        raise HTTPException(404, "Shift not found")
    if db.query(AttendanceSchedule).filter(AttendanceSchedule.shift_id == shift_id).first():
        raise HTTPException(409, "Shift is assigned to a schedule")
    if db.query(AttendanceGroup).filter(AttendanceGroup.shift_id == shift_id).first():
        raise HTTPException(409, "Shift is assigned to an attendance group")
    db.delete(shift)
    db.commit()
    return {"ok": True}


@router.get("/shifts/{shift_id}/breaks")
def list_shift_breaks(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(AttendanceShift, shift_id):
        raise HTTPException(404, "Shift not found")
    return [
        {
            "id": item.id,
            "shift_id": item.shift_id,
            "name": item.name,
            "start_time": item.start_time,
            "end_time": item.end_time,
            "paid": bool(item.paid),
            "is_active": bool(item.is_active),
        }
        for item in db.query(AttendanceBreak)
        .filter(AttendanceBreak.shift_id == shift_id)
        .order_by(AttendanceBreak.start_time)
        .all()
    ]


@router.post("/shifts/{shift_id}/breaks")
def create_shift_break(
    shift_id: int,
    body: _CreateBreakBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not db.get(AttendanceShift, shift_id):
        raise HTTPException(404, "Shift not found")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Break name is required")
    item = AttendanceBreak(
        shift_id=shift_id,
        name=name,
        start_time=_validate_hhmm(body.start_time, "start_time"),
        end_time=_validate_hhmm(body.end_time, "end_time"),
        paid=1 if body.paid else 0,
        is_active=1 if body.is_active else 0,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "ok": True}


@router.delete("/shift-breaks/{break_id}")
def delete_shift_break(
    break_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    item = db.get(AttendanceBreak, break_id)
    if not item:
        raise HTTPException(404, "Break not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/groups")
def list_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    groups = db.query(AttendanceGroup).options(joinedload(AttendanceGroup.shift)).order_by(AttendanceGroup.name).all()
    return [
        _serialize_group(
            group,
            db.query(AttendanceSchedule).filter(
                AttendanceSchedule.group_id == group.id,
                AttendanceSchedule.is_active == 1,
            ).count(),
        )
        for group in groups
    ]


@router.post("/groups")
def create_group(
    body: _CreateGroupBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Group name is required")
    if db.query(AttendanceGroup).filter(AttendanceGroup.name.ilike(name)).first():
        raise HTTPException(409, "Group name already exists")
    shift_id = body.shift_id or None
    if shift_id and not db.get(AttendanceShift, shift_id):
        raise HTTPException(404, "Shift not found")
    group = AttendanceGroup(
        name=name,
        description=(body.description or "").strip() or None,
        color=body.color or "#3B82F6",
        shift_id=shift_id,
        is_active=1 if body.is_active else 0,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _serialize_group(group)


@router.patch("/groups/{group_id}")
def update_group(
    group_id: int,
    body: _UpdateGroupBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    group = db.get(AttendanceGroup, group_id)
    if not group:
        raise HTTPException(404, "Attendance group not found")
    if "name" in body.model_fields_set:
        name = (body.name or "").strip()
        duplicate = db.query(AttendanceGroup).filter(
            AttendanceGroup.name.ilike(name),
            AttendanceGroup.id != group_id,
        ).first()
        if not name or duplicate:
            raise HTTPException(409 if duplicate else 400, "Group name is invalid or already exists")
        group.name = name
    if "description" in body.model_fields_set:
        group.description = (body.description or "").strip() or None
    if "color" in body.model_fields_set:
        group.color = body.color or "#3B82F6"
    if "shift_id" in body.model_fields_set:
        shift_id = body.shift_id or None
        if shift_id and not db.get(AttendanceShift, shift_id):
            raise HTTPException(404, "Shift not found")
        group.shift_id = shift_id
    if "is_active" in body.model_fields_set:
        group.is_active = 1 if body.is_active else 0
    db.commit()
    db.refresh(group)
    return _serialize_group(group)


@router.delete("/groups/{group_id}")
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    group = db.get(AttendanceGroup, group_id)
    if not group:
        raise HTTPException(404, "Attendance group not found")
    if db.query(AttendanceSchedule).filter(
        AttendanceSchedule.group_id == group_id,
        AttendanceSchedule.is_active == 1,
    ).first():
        raise HTTPException(409, "Move group members before deleting this group")
    db.delete(group)
    db.commit()
    return {"ok": True}


@router.get("/schedules")
def list_schedules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(AttendanceSchedule).options(
        joinedload(AttendanceSchedule.person),
        joinedload(AttendanceSchedule.group),
        joinedload(AttendanceSchedule.shift),
    ).order_by(AttendanceSchedule.valid_from.desc()).all()
    return [_serialize_schedule(item) for item in rows]


@router.post("/schedules")
def create_schedule(
    body: _CreateScheduleBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    group = db.get(AttendanceGroup, body.group_id) if body.group_id else None
    shift_id = int(body.shift_id or (group.shift_id if group else 0) or 0)
    shift = db.get(AttendanceShift, shift_id)
    valid_from = body.valid_from or _today_yerevan()
    person_ids = body.person_ids or ([body.person_id] if body.person_id else [])
    person_ids = list(dict.fromkeys(int(value) for value in person_ids if value))
    if not person_ids or not shift:
        raise HTTPException(404, "Person or shift not found")
    people = db.query(Person).filter(Person.id.in_(person_ids)).all()
    if len(people) != len(person_ids):
        raise HTTPException(404, "One or more people were not found")
    date.fromisoformat(valid_from)
    valid_to = body.valid_to or None
    if valid_to:
        date.fromisoformat(valid_to)
        if valid_to < valid_from:
            raise HTTPException(400, "valid_to must not be earlier than valid_from")
    db.query(AttendanceSchedule).filter(
        AttendanceSchedule.person_id.in_(person_ids),
        AttendanceSchedule.is_active == 1,
    ).update({"is_active": 0}, synchronize_session=False)
    schedules = [
        AttendanceSchedule(
            person_id=person.id,
            group_id=group.id if group else None,
            shift_id=shift.id,
            valid_from=valid_from,
            valid_to=valid_to,
            is_active=1,
        )
        for person in people
    ]
    db.add_all(schedules)
    db.commit()
    for schedule in schedules:
        db.refresh(schedule)
    return {
        "created": len(schedules),
        "schedules": [_serialize_schedule(schedule) for schedule in schedules],
    }


@router.delete("/schedules/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    schedule = db.get(AttendanceSchedule, schedule_id)
    if not schedule:
        raise HTTPException(404, "Schedule not found")
    db.delete(schedule)
    db.commit()
    return {"ok": True}


@router.get("/requests")
def list_requests(
    request_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AttendanceRequest).options(joinedload(AttendanceRequest.person))
    if request_type:
        query = query.filter(AttendanceRequest.request_type == request_type)
    if status:
        query = query.filter(AttendanceRequest.status == status)
    return [_serialize_request(item) for item in query.order_by(AttendanceRequest.created_at.desc()).all()]


@router.post("/requests")
def create_request(
    body: _CreateRequestBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    person = db.get(Person, body.person_id)
    if not person:
        raise HTTPException(404, "Person not found")
    if body.request_type not in {"leave", "overtime", "correction"}:
        raise HTTPException(400, "request_type must be leave, overtime, or correction")
    date_from = body.date_from or _today_yerevan()
    date_to = body.date_to or date_from
    date.fromisoformat(date_from)
    date.fromisoformat(date_to)
    if date_to < date_from:
        raise HTTPException(400, "date_to must not be earlier than date_from")
    item = AttendanceRequest(
        person_id=person.id,
        request_type=body.request_type,
        date_from=date_from,
        date_to=date_to,
        start_time=body.start_time or None,
        end_time=body.end_time or None,
        correction_in=body.correction_in or None,
        correction_out=body.correction_out or None,
        reason=(body.reason or "").strip() or None,
        status="pending",
        created_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_request(item)


def _local_time_to_utc(date_value: str, time_value: str | None):
    if not time_value:
        return None
    local = datetime.fromisoformat(f"{date_value}T{time_value}").replace(tzinfo=YEREVAN_TZ)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


@router.post("/requests/{request_id}/review")
def review_request(
    request_id: int,
    body: _ReviewRequestBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    item = db.get(AttendanceRequest, request_id)
    if not item:
        raise HTTPException(404, "Attendance request not found")
    if body.decision not in {"approved", "rejected"}:
        raise HTTPException(400, "decision must be approved or rejected")
    if item.status != "pending":
        raise HTTPException(409, "Request has already been reviewed")
    item.status = body.decision
    item.reviewer_note = (body.reviewer_note or "").strip() or None
    item.reviewed_by = current_user.id
    item.reviewed_at = utc_now()

    if body.decision == "approved" and item.request_type == "leave":
        current = date.fromisoformat(item.date_from)
        end = date.fromisoformat(item.date_to)
        while current <= end:
            work_date = current.isoformat()
            record = db.query(AttendanceRecord).filter(
                AttendanceRecord.person_id == item.person_id,
                AttendanceRecord.work_date == work_date,
            ).first() or AttendanceRecord(person_id=item.person_id, work_date=work_date)
            record.status = "leave"
            record.is_manual = 1
            record.note = item.reason or "Approved leave"
            db.add(record)
            current += timedelta(days=1)
    elif body.decision == "approved" and item.request_type == "correction":
        record = db.query(AttendanceRecord).filter(
            AttendanceRecord.person_id == item.person_id,
            AttendanceRecord.work_date == item.date_from,
        ).first() or AttendanceRecord(person_id=item.person_id, work_date=item.date_from)
        record.check_in_at = _local_time_to_utc(item.date_from, item.correction_in)
        record.check_out_at = _local_time_to_utc(item.date_from, item.correction_out)
        if record.check_in_at and record.check_out_at:
            record.work_minutes = max(0, int((record.check_out_at - record.check_in_at).total_seconds() / 60))
        record.status = "present"
        record.is_manual = 1
        record.note = item.reason or "Approved attendance correction"
        db.add(record)
    db.commit()
    db.refresh(item)
    return _serialize_request(item)


@router.get("/calculation-summary")
def calculation_summary(
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    records = db.query(AttendanceRecord).filter(
        AttendanceRecord.work_date >= date_from,
        AttendanceRecord.work_date <= date_to,
    ).all()
    status_counts = {}
    total_minutes = 0
    for record in records:
        status_counts[record.status] = status_counts.get(record.status, 0) + 1
        total_minutes += record.work_minutes or 0
    pending = db.query(AttendanceRequest).filter(AttendanceRequest.status == "pending").count()
    return {
        "date_from": date_from,
        "date_to": date_to,
        "records": len(records),
        "status_counts": status_counts,
        "total_work_minutes": total_minutes,
        "total_work_hours": _fmt_minutes(total_minutes),
        "pending_requests": pending,
    }


@router.post("/recalculate")
def recalculate_attendance(
    body: _RecalculateBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    query = db.query(AttendanceRecord).filter(
        AttendanceRecord.work_date >= body.date_from,
        AttendanceRecord.work_date <= body.date_to,
    )
    person_ids = [int(v) for v in (body.person_ids or []) if v]
    if person_ids:
        query = query.filter(AttendanceRecord.person_id.in_(person_ids))
    records = query.all()
    # Group records by (person_id, work_date) to bulk-preload rules
    # and avoid N+1 (one query per record → one query per unique date)
    dates_by_person: dict = {}
    for rec in records:
        dates_by_person.setdefault(rec.work_date, set()).add(rec.person_id)

    rules_cache: dict = {}  # (person_id, work_date) → rule
    for work_date, pids in dates_by_person.items():
        bulk = _bulk_effective_rules(db, list(pids), work_date)
        for pid, rule in bulk.items():
            rules_cache[(pid, work_date)] = rule

    for record in records:
        rule = rules_cache.get((record.person_id, record.work_date))
        _recalculate_record(record, rule)
        record.updated_at = utc_now()
    db.commit()
    add_audit_log(
        db, current_user, "ATTENDANCE_RECALCULATE", "attendance_record", None,
        f"Recalculated {len(records)} records from {body.date_from} to {body.date_to}",
    )
    return {"ok": True, "recalculated": len(records)}


@router.get("/credential-status")
def attendance_credential_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    people = _attendance_people_query(db).all()
    rows = []
    totals = {"card": 0, "face": 0, "missing": 0}
    for person in people:
        has_card = bool(person.card_number)
        has_face = bool(person.face_embedding)
        if has_card:
            totals["card"] += 1
        if has_face:
            totals["face"] += 1
        if not has_card and not has_face:
            totals["missing"] += 1
        rows.append({
            "person_id": person.id,
            "person_name": person.full_name,
            "department": person.department,
            "card": has_card,
            "face": has_face,
            "fingerprint": False,
            "iris": False,
            "palm": False,
        })
    return {"total_people": len(people), "totals": totals, "people": rows}


@router.get("/reports/{period}")
def attendance_period_report(
    period: str,
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if period not in {"daily", "weekly", "monthly", "summary", "custom"}:
        raise HTTPException(400, "Unsupported report period")
    records = (
        db.query(AttendanceRecord)
        .options(joinedload(AttendanceRecord.person))
        .filter(
            AttendanceRecord.work_date >= date_from,
            AttendanceRecord.work_date <= date_to,
        )
        .order_by(AttendanceRecord.work_date, AttendanceRecord.person_id)
        .all()
    )
    grouped = {}
    for record in records:
        row = grouped.setdefault(record.person_id, {
            "person_id": record.person_id,
            "person_name": record.person.full_name if record.person else None,
            "department": record.person.department if record.person else None,
            "days": 0,
            "work_minutes": 0,
            "overtime_minutes": 0,
            "status_counts": {},
        })
        row["days"] += 1
        row["work_minutes"] += record.work_minutes or 0
        row["overtime_minutes"] += record.overtime_minutes or 0
        row["status_counts"][record.status] = row["status_counts"].get(record.status, 0) + 1
    rows = list(grouped.values())
    for row in rows:
        row["work_hours"] = _fmt_minutes(row["work_minutes"])
        row["overtime_hours"] = _fmt_minutes(row["overtime_minutes"])
    return {
        "period": period,
        "date_from": date_from,
        "date_to": date_to,
        "people": rows,
        "records": len(records),
    }


# ── Individual punches (all IN/OUT events per person per day) ─────────────────

@router.get("/punches")
def list_punches(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to:   str = Query(..., description="YYYY-MM-DD"),
    person_id: Optional[int] = Query(None),
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all individual access_granted events (punches) per person for a date range.
    Also returns the day's first-IN / last-OUT from AttendanceRecord for comparison.
    """
    # Convert Yerevan date range to UTC window
    tz = YEREVAN_TZ
    try:
        dt_from = datetime.fromisoformat(date_from).replace(tzinfo=tz) - timedelta(hours=4)
        dt_to   = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=tz) + timedelta(hours=0)
    except ValueError:
        raise HTTPException(400, "date_from / date_to must be YYYY-MM-DD")

    # Pull events
    q = (
        db.query(AcsAccessEvent)
        .options(
            joinedload(AcsAccessEvent.person),
            joinedload(AcsAccessEvent.device),
        )
        .filter(
            AcsAccessEvent.event_type == "access_granted",
            AcsAccessEvent.person_id.isnot(None),
            AcsAccessEvent.created_at >= dt_from,
            AcsAccessEvent.created_at <= dt_to,
        )
    )
    if person_id:
        q = q.filter(AcsAccessEvent.person_id == person_id)

    events = q.order_by(AcsAccessEvent.person_id, AcsAccessEvent.created_at).all()

    # Filter by department if requested
    if department:
        events = [e for e in events if e.person and e.person.department == department]

    # Only employee/vip persons
    events = [
        e for e in events
        if e.person and e.person.person_type in ("employee", "vip")
    ]

    # Group by (person_id, work_date)
    from collections import defaultdict
    groups: dict = defaultdict(list)
    for ev in events:
        ev_yerevan = ev.created_at + timedelta(hours=4)
        work_date  = ev_yerevan.strftime("%Y-%m-%d")
        groups[(ev.person_id, work_date)].append(ev)

    # Load AttendanceRecords for the range to get first-in / last-out
    records_map = {}
    for rec in (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.work_date >= date_from,
            AttendanceRecord.work_date <= date_to,
        )
        .all()
    ):
        if person_id is None or rec.person_id == person_id:
            records_map[(rec.person_id, rec.work_date)] = rec

    def fmt_yerevan(dt):
        if not dt:
            return None
        return (dt + timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%S")

    rows = []
    for (pid, work_date), evs in sorted(groups.items(), key=lambda x: (x[0][1], x[0][0])):
        person = evs[0].person
        rec    = records_map.get((pid, work_date))
        punches = [
            {
                "time":        fmt_yerevan(ev.created_at),
                "direction":   ev.direction or "unknown",
                "verify_mode": ev.verify_mode or "unknown",
                "device_name": ev.device.name if ev.device else None,
                "door_no":     ev.door_no,
            }
            for ev in evs
        ]
        rows.append({
            "person_id":   pid,
            "person_name": person.full_name if person else None,
            "department":  person.department if person else None,
            "work_date":   work_date,
            "first_in":    fmt_yerevan(rec.check_in_at)  if rec else None,
            "last_out":    fmt_yerevan(rec.check_out_at) if rec else None,
            "work_hours":  _fmt_minutes(rec.work_minutes) if rec else None,
            "status":      rec.status if rec else None,
            "punch_count": len(punches),
            "punches":     punches,
        })

    return {"date_from": date_from, "date_to": date_to, "rows": rows}
