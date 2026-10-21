"""Feature 8: Holiday Calendar — restrict/allow access on holidays."""

import json
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.models import AcsHoliday, User
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/holidays", tags=["acs_holidays"])

# Armenian public holidays (recurring)
ARM_DEFAULT_HOLIDAYS = [
    {"name": "New Year", "date": "01-01", "is_recurring": 1},
    {"name": "New Year Holiday", "date": "01-02", "is_recurring": 1},
    {"name": "Christmas", "date": "01-06", "is_recurring": 1},
    {"name": "Army Day", "date": "01-28", "is_recurring": 1},
    {"name": "International Women's Day", "date": "03-08", "is_recurring": 1},
    {"name": "Labour Day", "date": "05-01", "is_recurring": 1},
    {"name": "Victory & Peace Day", "date": "05-09", "is_recurring": 1},
    {"name": "First Republic Day", "date": "05-28", "is_recurring": 1},
    {"name": "Constitution Day", "date": "07-05", "is_recurring": 1},
    {"name": "Independence Day", "date": "09-21", "is_recurring": 1},
    {"name": "Earthquake Remembrance", "date": "12-07", "is_recurring": 1},
]


def _holiday_out(h: AcsHoliday) -> dict:
    return {
        "id": h.id, "name": h.name, "date": h.date,
        "is_recurring": bool(h.is_recurring),
        "holiday_type": h.holiday_type,
        "access_overrides": json.loads(h.access_overrides or "{}"),
        "notes": h.notes, "created_at": h.created_at,
    }


def _is_holiday_today(db: Session) -> bool:
    today = date.today().strftime("%Y-%m-%d")
    today_mmdd = today[5:]  # MM-DD
    return bool(
        db.query(AcsHoliday).filter(
            (AcsHoliday.date == today) |
            ((AcsHoliday.is_recurring == 1) & (AcsHoliday.date == today_mmdd)),
        ).first()
    )


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("")
def list_holidays(
    year: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AcsHoliday).order_by(AcsHoliday.date)
    if year:
        q = q.filter(or_(
            AcsHoliday.date.like(f"{year}-%"),
            AcsHoliday.is_recurring == 1,
        ))
    return [_holiday_out(h) for h in q.all()]


@router.get("/today")
def today_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today      = date.today().strftime("%Y-%m-%d")
    today_mmdd = today[5:]
    holiday = db.query(AcsHoliday).filter(
        (AcsHoliday.date == today) |
        ((AcsHoliday.is_recurring == 1) & (AcsHoliday.date == today_mmdd)),
    ).first()
    return {
        "today": today,
        "is_holiday": holiday is not None,
        "holiday": _holiday_out(holiday) if holiday else None,
    }


@router.post("")
def create_holiday(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not data.get("name") or not data.get("date"):
        raise HTTPException(400, "name and date are required")
    h = AcsHoliday(
        name=data["name"].strip(),
        date=data["date"].strip(),
        is_recurring=1 if data.get("is_recurring") else 0,
        holiday_type=data.get("holiday_type", "custom"),
        access_overrides=json.dumps(data.get("access_overrides") or {}),
        notes=data.get("notes"),
    )
    db.add(h); db.commit(); db.refresh(h)
    return _holiday_out(h)


@router.patch("/{holiday_id}")
def update_holiday(
    holiday_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    h = db.get(AcsHoliday, holiday_id)
    if not h:
        raise HTTPException(404, "Holiday not found")
    for field in ("name", "date", "holiday_type", "notes"):
        if field in data:
            setattr(h, field, data[field])
    if "is_recurring" in data:
        h.is_recurring = 1 if data["is_recurring"] else 0
    if "access_overrides" in data:
        h.access_overrides = json.dumps(data["access_overrides"])
    db.commit(); db.refresh(h)
    return _holiday_out(h)


@router.delete("/{holiday_id}")
def delete_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    h = db.get(AcsHoliday, holiday_id)
    if not h:
        raise HTTPException(404, "Holiday not found")
    db.delete(h); db.commit()
    return {"ok": True}


@router.post("/seed-armenian")
def seed_armenian_holidays(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Populate the calendar with standard Armenian public holidays."""
    added = 0
    for h in ARM_DEFAULT_HOLIDAYS:
        exists = db.query(AcsHoliday).filter(
            AcsHoliday.date == h["date"],
            AcsHoliday.name == h["name"],
        ).first()
        if not exists:
            db.add(AcsHoliday(
                name=h["name"], date=h["date"],
                is_recurring=h["is_recurring"],
                holiday_type="public",
            ))
            added += 1
    db.commit()
    return {"ok": True, "added": added}
