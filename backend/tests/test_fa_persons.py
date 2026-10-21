"""Tests for Face Analytics persons router — pagination, search, filter."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from fastapi import FastAPI
from fastapi.responses import Response as FastAPIResponse

from app.db import Base
from app.models import Person
from app.routers.persons import router, list_persons
from app.schemas import PersonOut


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


class _FakeResponse:
    """Minimal response stub for testing list_persons signature."""
    def __init__(self):
        self.headers = {}


def _seed_persons(db):
    persons = [
        Person(full_name="Alice Smith",   person_type="employee",  department="Engineering"),
        Person(full_name="Bob Jones",     person_type="employee",  department="Sales"),
        Person(full_name="Carol VIP",     person_type="vip",       department="Exec"),
        Person(full_name="Dave Blacklist",person_type="blacklist",  department="Security"),
        Person(full_name="Eve Smith",     person_type="employee",  department="Engineering"),
    ]
    for p in persons:
        db.add(p)
    db.commit()
    return persons


# ── Pagination ────────────────────────────────────────────────────────────────

def test_list_persons_default_limit():
    db = _session()
    _seed_persons(db)
    resp = _FakeResponse()
    result = list_persons(response=resp, limit=200, offset=0, search=None, person_type=None, db=db, current_user=None)
    # All 5 persons (no unknowns, no acs)
    assert len(result) == 5


def test_list_persons_pagination():
    db = _session()
    _seed_persons(db)
    resp = _FakeResponse()
    page1 = list_persons(response=resp, limit=2, offset=0, search=None, person_type=None, db=db, current_user=None)
    page2 = list_persons(response=resp, limit=2, offset=2, search=None, person_type=None, db=db, current_user=None)
    assert len(page1) == 2
    assert len(page2) == 2
    # No overlap
    ids1 = {p.id for p in page1}
    ids2 = {p.id for p in page2}
    assert not ids1.intersection(ids2)


def test_list_persons_total_count_header():
    db = _session()
    _seed_persons(db)
    resp = _FakeResponse()
    list_persons(response=resp, limit=2, offset=0, search=None, person_type=None, db=db, current_user=None)
    assert resp.headers.get("X-Total-Count") == "5"


# ── Search ────────────────────────────────────────────────────────────────────

def test_list_persons_search_by_name():
    db = _session()
    _seed_persons(db)
    resp = _FakeResponse()
    result = list_persons(response=resp, limit=200, offset=0, search="Smith", person_type=None, db=db, current_user=None)
    names = {p.full_name for p in result}
    assert "Alice Smith" in names
    assert "Eve Smith" in names
    assert len(result) == 2


def test_list_persons_search_by_department():
    db = _session()
    _seed_persons(db)
    resp = _FakeResponse()
    result = list_persons(response=resp, limit=200, offset=0, search="Engineering", person_type=None, db=db, current_user=None)
    assert len(result) == 2


def test_list_persons_search_no_results():
    db = _session()
    _seed_persons(db)
    resp = _FakeResponse()
    result = list_persons(response=resp, limit=200, offset=0, search="NOBODY", person_type=None, db=db, current_user=None)
    assert len(result) == 0


# ── Type filter ───────────────────────────────────────────────────────────────

def test_list_persons_filter_by_type():
    db = _session()
    _seed_persons(db)
    resp = _FakeResponse()
    employees = list_persons(response=resp, limit=200, offset=0, search=None, person_type="employee", db=db, current_user=None)
    assert all(p.person_type == "employee" for p in employees)
    assert len(employees) == 3


def test_list_persons_filter_vip():
    db = _session()
    _seed_persons(db)
    resp = _FakeResponse()
    vips = list_persons(response=resp, limit=200, offset=0, search=None, person_type="vip", db=db, current_user=None)
    assert len(vips) == 1
    assert vips[0].full_name == "Carol VIP"


def test_list_persons_excludes_unknown_and_acs():
    db = _session()
    # Add unknown + acs persons
    db.add(Person(full_name="Unknown1", person_type="unknown"))
    db.add(Person(full_name="ACS Person", person_type="employee", source="acs"))
    db.commit()
    resp = _FakeResponse()
    result = list_persons(response=resp, limit=200, offset=0, search=None, person_type=None, db=db, current_user=None)
    names = {p.full_name for p in result}
    assert "Unknown1" not in names
    assert "ACS Person" not in names
