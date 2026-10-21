"""Tests for N+1 fix in attendance_pro.py — bulk rule loading."""

from datetime import timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import (
    AttendanceRecord, AttendanceRule, AttendanceSchedule,
    AttendanceShift, Person,
)
from app.utils import utc_now


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _employees(db, n=5):
    people = []
    for i in range(n):
        p = Person(full_name=f"Emp {i}", person_type="employee", employee_no=f"E{i:03d}")
        db.add(p)
        people.append(p)
    db.commit()
    return people


# ── _bulk_effective_rules ─────────────────────────────────────────────────────

def test_bulk_effective_rules_returns_default_when_no_schedules():
    from app.routers.attendance_pro import _bulk_effective_rules
    db = _session()
    # Need at least one AttendanceRule for default
    db.add(AttendanceRule(name="Default", work_start="09:00", work_end="18:00"))
    db.commit()
    employees = _employees(db, 3)
    today = "2025-06-01"
    result = _bulk_effective_rules(db, [e.id for e in employees], today)
    assert len(result) == 3
    for pid, rule in result.items():
        assert rule is not None


def test_bulk_effective_rules_uses_person_schedule():
    from app.routers.attendance_pro import _bulk_effective_rules
    db = _session()
    db.add(AttendanceRule(name="Default", work_start="09:00", work_end="18:00"))
    employees = _employees(db, 2)
    db.commit()

    # Assign a custom shift to employee[0]
    shift = AttendanceShift(
        name="Night Shift", work_start="22:00", work_end="06:00",
        calculation_mode="first_last", is_active=1,
    )
    db.add(shift); db.commit()
    sched = AttendanceSchedule(
        person_id=employees[0].id,
        shift_id=shift.id,
        valid_from="2025-01-01",
        is_active=1,
    )
    db.add(sched); db.commit()

    result = _bulk_effective_rules(db, [e.id for e in employees], "2025-06-01")
    assert result[employees[0].id].name == "Night Shift"
    # employee[1] gets default rule (AttendanceRule, not AttendanceShift)
    assert result[employees[1].id] is not None


def test_bulk_effective_rules_empty_list():
    from app.routers.attendance_pro import _bulk_effective_rules
    db = _session()
    result = _bulk_effective_rules(db, [], "2025-06-01")
    assert result == {}


def test_bulk_same_result_as_individual():
    """_bulk_effective_rules must return identical rules as _effective_attendance_rule."""
    from app.routers.attendance_pro import _bulk_effective_rules, _effective_attendance_rule
    db = _session()
    db.add(AttendanceRule(name="Default", work_start="09:00", work_end="18:00"))
    employees = _employees(db, 4)
    db.commit()

    today = "2025-06-15"
    bulk = _bulk_effective_rules(db, [e.id for e in employees], today)
    for emp in employees:
        individual = _effective_attendance_rule(db, emp.id, today)
        # Both should give same result (same object or same type)
        assert type(bulk[emp.id]) == type(individual)


# ── Today summary uses bulk rules ─────────────────────────────────────────────

def test_today_summary_no_n1(monkeypatch):
    """Verify today_summary calls _bulk_effective_rules, not _effective_attendance_rule per person."""
    from app.routers import attendance_pro as amod

    call_count = {"single": 0, "bulk": 0}
    original_single = amod._effective_attendance_rule
    original_bulk   = amod._bulk_effective_rules

    def patched_single(db, pid, date):
        call_count["single"] += 1
        return original_single(db, pid, date)

    def patched_bulk(db, pids, date):
        call_count["bulk"] += 1
        return original_bulk(db, pids, date)

    monkeypatch.setattr(amod, "_effective_attendance_rule", patched_single)
    monkeypatch.setattr(amod, "_bulk_effective_rules", patched_bulk)

    db = _session()
    db.add(AttendanceRule(name="Default", work_start="09:00", work_end="18:00"))
    _employees(db, 5)
    db.commit()

    amod.today_summary(db=db, current_user=None)

    assert call_count["bulk"] == 1, "today_summary should call _bulk_effective_rules exactly once"
    assert call_count["single"] == 0, "today_summary must NOT call _effective_attendance_rule per person"
