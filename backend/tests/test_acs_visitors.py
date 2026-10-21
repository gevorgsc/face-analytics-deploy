"""Tests for Visitor Management — CRUD, watch list, approval workflow."""

import pytest
from datetime import timedelta
from unittest.mock import MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Visitor, VisitorWatchEntry, Person
from app.routers.acs_visitors import (
    list_visitors, create_visitor,
    list_watch_entries, create_watch_entry, delete_watch_entry,
    review_visitor,
)
from app.utils import utc_now
from fastapi import HTTPException


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _fake_user(role="admin"):
    u = MagicMock()
    u.id = 1
    u.role = role
    return u


def _fake_request():
    r = MagicMock()
    r.client = None
    return r


def _valid_visitor_data():
    now = utc_now()
    return {
        "full_name": "John Visitor",
        "host_name": "Alice Host",
        "valid_from": now.isoformat(),
        "valid_to": (now + timedelta(hours=8)).isoformat(),
        "visit_reason": "Meeting",
    }


# ── Visitor CRUD ──────────────────────────────────────────────────────────────

def test_create_visitor_returns_correct_fields():
    db = _session()
    v = create_visitor(_fake_request(), _valid_visitor_data(), db, _fake_user())
    assert v["full_name"] == "John Visitor"
    assert v["host_name"] == "Alice Host"
    assert v["status"] == "reserved"


def test_create_visitor_full_name_required():
    db = _session()
    data = _valid_visitor_data()
    data["full_name"] = ""
    with pytest.raises(HTTPException) as exc:
        create_visitor(_fake_request(), data, db, _fake_user())
    assert exc.value.status_code == 400


def test_create_visitor_valid_to_required():
    db = _session()
    data = _valid_visitor_data()
    del data["valid_to"]
    with pytest.raises(HTTPException) as exc:
        create_visitor(_fake_request(), data, db, _fake_user())
    assert exc.value.status_code == 400


def test_list_visitors_empty():
    db = _session()
    result = list_visitors(status=None, limit=100, db=db, current_user=_fake_user())
    assert result == []


def test_list_visitors_filter_by_status():
    db = _session()
    create_visitor(_fake_request(), _valid_visitor_data(), db, _fake_user())
    all_v   = list_visitors(status=None,       limit=100, db=db, current_user=_fake_user())
    reserved = list_visitors(status="reserved", limit=100, db=db, current_user=_fake_user())
    assert len(all_v) == 1
    assert len(reserved) == 1
    assert reserved[0]["status"] == "reserved"


# ── Approval workflow ─────────────────────────────────────────────────────────

def test_review_visitor_approves():
    db = _session()
    v = create_visitor(_fake_request(), _valid_visitor_data(), db, _fake_user())
    # Change to pending so review works
    visitor = db.get(Visitor, v["id"])
    visitor.approval_status = "pending"
    db.commit()

    result = review_visitor(v["id"], {"decision": "approved"}, db, _fake_user())
    assert result["approval_status"] == "approved"


def test_review_visitor_rejects():
    db = _session()
    v = create_visitor(_fake_request(), _valid_visitor_data(), db, _fake_user())
    visitor = db.get(Visitor, v["id"])
    visitor.approval_status = "pending"
    db.commit()

    result = review_visitor(v["id"], {"decision": "rejected"}, db, _fake_user())
    assert result["approval_status"] == "rejected"
    assert result["status"] == "cancelled"


def test_review_visitor_invalid_decision():
    db = _session()
    v = create_visitor(_fake_request(), _valid_visitor_data(), db, _fake_user())
    with pytest.raises(HTTPException) as exc:
        review_visitor(v["id"], {"decision": "maybe"}, db, _fake_user())
    assert exc.value.status_code == 400


# ── Watch list ────────────────────────────────────────────────────────────────

def test_watch_list_create_and_list():
    db = _session()
    # create_watch_entry returns {"id": ..., "ok": True}, not a full dict
    entry = create_watch_entry({"full_name": "Bad Actor", "reason": "theft"}, db, _fake_user())
    assert "id" in entry
    entries = list_watch_entries(db=db, current_user=_fake_user())
    assert len(entries) == 1
    # list returns full row data
    assert entries[0]["full_name"] == "Bad Actor"


def test_watch_list_full_name_required():
    db = _session()
    with pytest.raises(HTTPException) as exc:
        create_watch_entry({"reason": "no name"}, db, _fake_user())
    assert exc.value.status_code == 400


def test_watch_list_delete():
    db = _session()
    entry = create_watch_entry({"full_name": "Delete Me"}, db, _fake_user())
    delete_watch_entry(entry["id"], db, _fake_user())
    remaining = list_watch_entries(db=db, current_user=_fake_user())
    assert len(remaining) == 0
