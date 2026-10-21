"""Tests for Guard Tour — CRUD, is_ordered enforcement, execution lifecycle."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import AccessControlDevice, GuardTour, GuardTourCheckpoint, GuardTourExecution, GuardTourCheckpointLog
from app.routers.acs_guard_tour import (
    list_tours, create_tour, delete_tour,
    add_checkpoint, start_execution, scan_checkpoint,
)
from fastapi import HTTPException


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _device(db):
    d = AccessControlDevice(name="Gate A", ip_address="10.0.0.1", door_count=4)
    db.add(d); db.commit()
    return d


# ── CRUD ──────────────────────────────────────────────────────────────────────

def test_create_tour_returns_correct_fields():
    db = _session()
    result = create_tour({"name": "Night Round", "is_ordered": True}, db, None)
    assert result["name"] == "Night Round"
    assert result["is_ordered"] is True
    assert result["checkpoints"] == []


def test_list_tours_empty():
    db = _session()
    assert list_tours(db, None) == []


def test_delete_tour():
    db = _session()
    tour = create_tour({"name": "Round 1"}, db, None)
    delete_tour(tour["id"], db, None)
    assert list_tours(db, None) == []


def test_create_tour_name_required():
    db = _session()
    with pytest.raises(HTTPException) as exc:
        create_tour({}, db, None)
    assert exc.value.status_code == 400


# ── Checkpoints ───────────────────────────────────────────────────────────────

def test_add_checkpoint_accepts_order_alias():
    db = _session()
    device = _device(db)
    tour = create_tour({"name": "T1"}, db, None)
    cp = add_checkpoint(tour["id"], {"device_id": device.id, "door_no": 1, "order": 1, "name": "Entry"}, db, None)
    assert cp["sequence"] == 1
    assert cp["order"] == 1
    assert cp["name"] == "Entry"
    assert cp["location_name"] == "Entry"


def test_add_checkpoint_unknown_device_raises_404():
    db = _session()
    tour = create_tour({"name": "T2"}, db, None)
    with pytest.raises(HTTPException) as exc:
        add_checkpoint(tour["id"], {"device_id": 9999, "door_no": 1}, db, None)
    assert exc.value.status_code == 404


# ── Execution lifecycle ───────────────────────────────────────────────────────

def test_execution_creates_checkpoint_logs():
    db = _session()
    device = _device(db)
    tour = create_tour({"name": "T3", "is_ordered": True}, db, None)
    add_checkpoint(tour["id"], {"device_id": device.id, "door_no": 1, "order": 1, "name": "A"}, db, None)
    add_checkpoint(tour["id"], {"device_id": device.id, "door_no": 2, "order": 2, "name": "B"}, db, None)
    execution = start_execution(tour["id"], {}, db, None)
    assert len(execution["checkpoint_logs"]) == 2
    assert execution["status"] == "in_progress"


def test_scan_checkpoint_updates_completion():
    db = _session()
    device = _device(db)
    tour = create_tour({"name": "T4", "is_ordered": False}, db, None)  # unordered
    add_checkpoint(tour["id"], {"device_id": device.id, "door_no": 1, "order": 1, "name": "P1"}, db, None)
    execution = start_execution(tour["id"], {}, db, None)
    cp_id = execution["checkpoint_logs"][0]["checkpoint_id"]
    result = scan_checkpoint(execution["id"], cp_id, db, None)
    assert result["ok"] is True
    assert result["completion_pct"] == 100.0
    assert result["status"] == "completed"


def test_scan_ordered_out_of_sequence_raises_422():
    db = _session()
    device = _device(db)
    tour_data = create_tour({"name": "T5", "is_ordered": True}, db, None)
    add_checkpoint(tour_data["id"], {"device_id": device.id, "door_no": 1, "order": 1, "name": "First"}, db, None)
    add_checkpoint(tour_data["id"], {"device_id": device.id, "door_no": 2, "order": 2, "name": "Second"}, db, None)
    # Reload tour with checkpoints
    tour_obj = db.query(GuardTour).filter(GuardTour.id == tour_data["id"]).first()
    tour_obj.is_ordered = 1
    db.commit()

    execution = start_execution(tour_data["id"], {}, db, None)
    logs = execution["checkpoint_logs"]
    # Sort by checkpoint sequence to find second checkpoint's id
    seq_map = {}
    for log in logs:
        cp = db.query(GuardTourCheckpoint).filter(GuardTourCheckpoint.id == log["checkpoint_id"]).first()
        if cp:
            seq_map[cp.sequence] = log["checkpoint_id"]

    # Try to scan sequence=2 before sequence=1 → should raise 422
    if 1 in seq_map and 2 in seq_map:
        with pytest.raises(HTTPException) as exc:
            scan_checkpoint(execution["id"], seq_map[2], db, None)
        assert exc.value.status_code == 422


def test_scan_already_completed_raises_409():
    db = _session()
    device = _device(db)
    tour = create_tour({"name": "T6", "is_ordered": False}, db, None)
    add_checkpoint(tour["id"], {"device_id": device.id, "door_no": 1, "order": 1, "name": "X"}, db, None)
    execution = start_execution(tour["id"], {}, db, None)
    cp_id = execution["checkpoint_logs"][0]["checkpoint_id"]
    scan_checkpoint(execution["id"], cp_id, db, None)
    with pytest.raises(HTTPException) as exc:
        scan_checkpoint(execution["id"], cp_id, db, None)
    assert exc.value.status_code == 409
