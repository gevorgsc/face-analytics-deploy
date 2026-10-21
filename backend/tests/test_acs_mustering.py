"""Tests for Mustering / Evacuation Report — field contract + PDF endpoint."""

from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import AccessControlDevice, AcsAccessEvent, Person
from app.routers.acs_mustering import mustering_snapshot, evacuation_report, event_flow
from app.utils import utc_now


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _seed(db):
    person = Person(full_name="Alice", department="Engineering")
    device = AccessControlDevice(name="Main Gate", ip_address="10.0.0.1")
    db.add_all([person, device]); db.commit()

    # IN event 10 minutes ago
    db.add(AcsAccessEvent(
        device_id=device.id, person_id=person.id,
        event_type="access_granted", direction="in",
        card_number="CARD001",
        created_at=utc_now() - timedelta(minutes=10),
    ))
    db.commit()
    return person, device


# ── Snapshot field contract ───────────────────────────────────────────────────

def test_snapshot_returns_persons_inside_key():
    db = _session()
    _seed(db)
    result = mustering_snapshot(since_hours=1, db=db, current_user=None)
    assert "persons_inside" in result, "Frontend expects 'persons_inside'"
    assert "persons" in result, "Backward compat key 'persons' must also exist"
    assert result["persons_inside"] is result["persons"]


def test_snapshot_returns_entry_exit_counts():
    db = _session()
    _seed(db)
    result = mustering_snapshot(since_hours=1, db=db, current_user=None)
    assert "entries_today" in result
    assert "exits_today" in result
    assert isinstance(result["entries_today"], int)
    assert isinstance(result["exits_today"], int)


def test_snapshot_persons_have_card_number():
    db = _session()
    _seed(db)
    result = mustering_snapshot(since_hours=1, db=db, current_user=None)
    persons = result["persons_inside"]
    assert len(persons) == 1
    assert persons[0]["card_number"] == "CARD001"


def test_snapshot_persons_have_last_event_at():
    db = _session()
    _seed(db)
    result = mustering_snapshot(since_hours=1, db=db, current_user=None)
    person = result["persons_inside"][0]
    assert "last_event_at" in person
    assert "last_seen_at" in person
    assert person["last_event_at"] == person["last_seen_at"]


def test_snapshot_total_inside_matches_list():
    db = _session()
    _seed(db)
    result = mustering_snapshot(since_hours=1, db=db, current_user=None)
    assert result["total_inside"] == len(result["persons_inside"])


# ── Event flow ────────────────────────────────────────────────────────────────

def test_event_flow_returns_hourly_flow_key():
    db = _session()
    _seed(db)
    result = event_flow(hours=1, db=db, current_user=None)
    assert "hourly_flow" in result, "Frontend expects 'hourly_flow'"
    assert "flow" in result, "Backward compat 'flow' key must exist"


def test_event_flow_uses_entries_exits_keys():
    db = _session()
    _seed(db)
    result = event_flow(hours=1, db=db, current_user=None)
    for bucket in result["hourly_flow"]:
        assert "entries" in bucket
        assert "exits" in bucket
        assert "in" in bucket    # backward compat
        assert "out" in bucket   # backward compat


# ── Evacuation report ─────────────────────────────────────────────────────────

def test_evacuation_report_structure():
    db = _session()
    _seed(db)
    result = evacuation_report(since_hours=1, db=db, current_user=None)
    assert "total_inside" in result
    assert "by_department" in result
    assert result["total_inside"] >= 1
    dept = result["by_department"][0]
    assert "department" in dept
    assert "count" in dept
    assert "persons" in dept
