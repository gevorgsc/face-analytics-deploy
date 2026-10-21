"""Tests for Zone Occupancy — CRUD zones, entry/exit tracking, capacity checks."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import OccupancyZone, OccupancyZoneEntry, Person
from app.routers.acs_occupancy import (
    list_zones, create_zone, update_zone, delete_zone,
    record_entry,
    list_inside as list_entries,    # lists current occupants for a zone
)
from fastapi import HTTPException


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _person(db):
    p = Person(full_name="Charlie", card_number="C999")
    db.add(p); db.commit()
    return p


# ── Zone CRUD ─────────────────────────────────────────────────────────────────

def test_create_zone_returns_correct_fields():
    db = _session()
    result = create_zone({"name": "Server Room", "max_capacity": 5, "color": "#ef4444"}, db, None)
    assert result["name"] == "Server Room"
    assert result["max_capacity"] == 5
    assert result["current_count"] == 0
    assert result["is_over_capacity"] is False


def test_create_zone_name_required():
    db = _session()
    with pytest.raises(HTTPException) as exc:
        create_zone({}, db, None)
    assert exc.value.status_code == 400


def test_list_zones_empty():
    db = _session()
    assert list_zones(db=db, current_user=None) == []


def test_delete_zone():
    db = _session()
    z = create_zone({"name": "Z1"}, db, None)
    delete_zone(z["id"], db, None)
    assert list_zones(db=db, current_user=None) == []


def test_over_capacity_flag():
    db = _session()
    z = create_zone({"name": "Tiny", "max_capacity": 1}, db, None)
    p1 = Person(full_name="P1"); p2 = Person(full_name="P2")
    db.add_all([p1, p2]); db.commit()
    record_entry(z["id"], {"person_id": p1.id}, db, None)
    record_entry(z["id"], {"person_id": p2.id}, db, None)
    # Check via list_zones — it returns current_count and is_over_capacity per zone
    zones = list_zones(db=db, current_user=None)
    zone_data = next((zd for zd in zones if zd["id"] == z["id"]), None)
    assert zone_data is not None
    assert zone_data["is_over_capacity"] is True


# ── Entry / Exit ──────────────────────────────────────────────────────────────

def test_record_entry_increments_count():
    db = _session()
    person = _person(db)
    z = create_zone({"name": "Lobby", "max_capacity": 10}, db, None)
    record_entry(z["id"], {"person_id": person.id, "card_number": "C999"}, db, None)
    # Check count via list_inside (occupants currently in zone)
    inside = list_entries(z["id"], db=db, current_user=None)
    assert len(inside) == 1


def test_record_exit_decrements_count():
    db = _session()
    person = _person(db)
    z = create_zone({"name": "Lobby2", "max_capacity": 10}, db, None)
    # Enter
    record_entry(z["id"], {"person_id": person.id, "direction": "in"}, db, None)
    # Exit via direction='out' on the same endpoint (no separate record_exit function)
    record_entry(z["id"], {"person_id": person.id, "direction": "out"}, db, None)
    # After exit, list_inside should be empty
    inside = list_entries(z["id"], db=db, current_user=None)
    assert len(inside) == 0


def test_list_entries_returns_is_inside():
    db = _session()
    person = _person(db)
    z = create_zone({"name": "Lobby3"}, db, None)
    record_entry(z["id"], {"person_id": person.id}, db, None)
    # list_inside returns only currently-inside entries (exited_at IS NULL)
    entries = list_entries(z["id"], db=db, current_user=None)
    assert len(entries) == 1
    assert entries[0]["is_inside"] is True
