"""
Smoke tests for remaining ACS modules — correct API signatures.
"""

import pytest
from datetime import date
from unittest.mock import MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import (
    AccessControlDevice, TailgatingConfig,
    AcsHoliday, LiftConfig, MobileCard,
    AccessPolicyTemplate, AcsAccessRequest, Person,
)
from fastapi import HTTPException


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _device(db):
    d = AccessControlDevice(name="Gate", ip_address="10.0.0.1", door_count=2)
    db.add(d); db.commit()
    return d


def _fake_user(role="admin"):
    u = MagicMock(); u.id = 1; u.role = role; return u


# ── Tailgating ────────────────────────────────────────────────────────────────

def test_tailgating_create_and_list():
    from app.routers.acs_tailgating import create_config, list_configs
    db = _session()
    device = _device(db)
    cfg = create_config({"device_id": device.id, "door_no": 1}, db, None)
    assert cfg["device_id"] == device.id
    assert "detection_window_seconds" in cfg  # actual field name (not 'sensitivity')
    assert list_configs(db=db, current_user=None)


def test_tailgating_device_required():
    from app.routers.acs_tailgating import create_config
    db = _session()
    with pytest.raises(HTTPException) as exc:
        create_config({}, db, None)
    assert exc.value.status_code == 400


# ── Holidays ──────────────────────────────────────────────────────────────────

def test_holidays_create_and_list():
    from app.routers.acs_holidays import create_holiday, list_holidays
    db = _session()
    h = create_holiday({"name": "New Year", "date": "2025-01-01"}, db, None)
    assert h["name"] == "New Year"
    assert len(list_holidays(year=2025, db=db, current_user=None)) >= 1


def test_holidays_name_and_date_required():
    from app.routers.acs_holidays import create_holiday
    db = _session()
    with pytest.raises(HTTPException):
        create_holiday({"name": "Missing date"}, db, None)


# ── Lift Config ───────────────────────────────────────────────────────────────

def test_lift_create_config():
    from app.routers.acs_lift import create_lift, list_lifts
    db = _session()
    device = _device(db)
    # create_lift requires: name, device_id, door_no
    cfg = create_lift({"name": "Lift A", "device_id": device.id, "door_no": 1}, db, None)
    assert cfg["device_id"] == device.id
    assert cfg["name"] == "Lift A"
    assert len(list_lifts(db=db, current_user=None)) >= 1


def test_lift_missing_required_fields():
    from app.routers.acs_lift import create_lift
    db = _session()
    with pytest.raises(HTTPException) as exc:
        create_lift({}, db, None)
    assert exc.value.status_code == 400


# ── Mobile Cards ──────────────────────────────────────────────────────────────

def test_mobile_cards_create():
    from app.routers.acs_mobile_cards import issue_card, list_cards
    db = _session()
    person = Person(full_name="Mobile User", employee_no="M001")
    db.add(person); db.commit()
    # issue_card uses current_user.id for issued_by
    card = issue_card({"person_id": person.id, "card_number": "NFC001"}, db, _fake_user())
    assert card["person_id"] == person.id
    assert card["card_number"] == "NFC001"
    # Pass Query params explicitly as None to avoid FastAPI Query(None) default
    assert len(list_cards(person_id=None, status=None, limit=100, db=db, current_user=None)) >= 1


# ── Policy Templates ──────────────────────────────────────────────────────────

def test_policy_templates_create_and_list():
    from app.routers.acs_policy_templates import create_template, list_templates
    db = _session()
    # schedule_config must match the expected weekly structure
    from app.acs_schedule import default_schedule_config
    tmpl = create_template({
        "name": "Standard Employee",
        "description": "9-5 access",
        "schedule_config": default_schedule_config(),
        "access_level_ids": [],
    }, db, None)
    assert tmpl["name"] == "Standard Employee"
    assert len(list_templates(db=db, current_user=None)) >= 1


def test_policy_template_name_required():
    from app.routers.acs_policy_templates import create_template
    db = _session()
    with pytest.raises(HTTPException) as exc:
        create_template({}, db, None)
    assert exc.value.status_code == 400


# ── Access Requests ───────────────────────────────────────────────────────────

def test_access_request_create_and_approve():
    from app.routers.acs_access_requests import create_request, approve_request
    db = _session()
    person = Person(full_name="Requester", email="test@example.com")
    db.add(person); db.commit()

    # create_request uses current_user.id — pass fake user
    req = create_request({"person_id": person.id, "reason": "Need access"}, db, _fake_user())
    assert req["status"] == "pending"

    approved = approve_request(req["id"], {"note": "OK"}, db, _fake_user())
    assert approved["status"] == "approved"
    assert approved["reviewer_note"] == "OK"


def test_access_request_double_approve_raises():
    from app.routers.acs_access_requests import create_request, approve_request
    db = _session()
    person = Person(full_name="P2"); db.add(person); db.commit()
    req = create_request({"person_id": person.id}, db, _fake_user())
    approve_request(req["id"], {}, db, _fake_user())
    with pytest.raises(HTTPException) as exc:
        approve_request(req["id"], {}, db, _fake_user())
    assert exc.value.status_code == 409


# ── Audit Report ─────────────────────────────────────────────────────────────

def test_audit_report_summary_returns_structure():
    from app.routers.acs_audit_report import audit_summary
    db = _session()
    today = str(date.today())
    # audit_summary(date_from, date_to, person_id, device_id, event_type, db, current_user)
    result = audit_summary(
        date_from=today, date_to=today,
        person_id=None, device_id=None, event_type=None,
        db=db, current_user=None,
    )
    assert "total_events" in result
    assert "granted" in result
    assert "denied" in result


# ── ACS Notifications ─────────────────────────────────────────────────────────

def test_dispatch_acs_alert_no_configs_no_error():
    from app.acs_notifications import dispatch_acs_alert
    db = _session()
    dispatch_acs_alert(
        db, event_type="access_denied",
        person_name="Unknown", device_name="Gate",
        door_no=1, card_number="BAD001",
    )
