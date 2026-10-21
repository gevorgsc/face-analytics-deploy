from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import AccessControlDevice, DualAuthPending, Person
from app.routers import acs_dual_auth


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _setup(db):
    device = AccessControlDevice(
        name="Main",
        ip_address="127.0.0.1",
        door_count=2,
        is_active=1,
    )
    first = Person(
        employee_no="100",
        full_name="First",
        card_number="CARD-1",
        acs_active=1,
    )
    second = Person(
        employee_no="200",
        full_name="Second",
        card_number="CARD-2",
        acs_active=1,
    )
    db.add_all([device, first, second])
    db.commit()
    return device, first, second


def test_dual_auth_frontend_contract_and_real_unlock(monkeypatch):
    db = _session()
    device, first, second = _setup(db)
    rule = acs_dual_auth.create_rule({
        "device_id": device.id,
        "door_no": 2,
        "timeout_seconds": 45,
        "name": "Server room",            # name field for the rule name
        "description": "Server room access control",  # separate description field
    }, db, None)
    assert rule["name"] == "Server room"
    assert rule["description"] == "Server room access control"

    pending = acs_dual_auth.initiate_dual_auth({
        "device_id": device.id,
        "door_no": 2,
        "person_id": first.id,
        "card_number": "CARD-1",
    }, db, None)
    assert pending["person_name"] == "First"
    assert pending["device_id"] == device.id
    assert pending["door_no"] == 2

    calls = []
    monkeypatch.setattr(acs_dual_auth, "decrypt_camera_password", lambda value: "secret")
    monkeypatch.setattr(
        acs_dual_auth,
        "acs_door_control_isapi_sync",
        lambda *args: calls.append(args) or {"ok": True},
    )

    result = acs_dual_auth.confirm_dual_auth(
        pending["id"],
        {"card_number": "CARD-2"},
        db,
        SimpleNamespace(id=1),
    )

    assert result["ok"] is True
    assert result["second_person_id"] == second.id
    assert calls[0][-2:] == (2, "unlock")
    assert db.query(DualAuthPending).count() == 0


def test_dual_auth_rejects_same_card_and_keeps_pending_on_unlock_failure(monkeypatch):
    db = _session()
    device, first, _ = _setup(db)
    rule = acs_dual_auth.create_rule({
        "device_id": device.id,
        "door_no": 1,
        "description": "Vault",
    }, db, None)
    pending = acs_dual_auth.initiate_dual_auth({
        "device_id": device.id,
        "door_no": rule["door_no"],
        "person_id": first.id,
        "card_number": "CARD-1",
    }, db, None)

    with pytest.raises(HTTPException, match="different card"):
        acs_dual_auth.confirm_dual_auth(
            pending["id"],
            {"card_number": "CARD-1"},
            db,
            None,
        )

    monkeypatch.setattr(acs_dual_auth, "decrypt_camera_password", lambda value: "secret")
    monkeypatch.setattr(
        acs_dual_auth,
        "acs_door_control_isapi_sync",
        lambda *args: {"ok": False, "message": "offline"},
    )
    with pytest.raises(HTTPException, match="offline"):
        acs_dual_auth.confirm_dual_auth(
            pending["id"],
            {"card_number": "CARD-2"},
            db,
            None,
        )
    assert db.get(DualAuthPending, pending["id"]) is not None
