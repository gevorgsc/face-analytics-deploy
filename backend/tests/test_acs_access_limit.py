from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pytest

from app import acs_access_limit
from app.db import Base
from app.models import AccessControlDevice, AcsAccessEvent, CardIssue, Person


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_access_limit_deactivates_person_and_revokes_device_credentials(monkeypatch):
    db = _session()
    device = AccessControlDevice(
        name="Test controller",
        ip_address="127.0.0.1",
        username="admin",
        password="",
        is_active=1,
    )
    person = Person(
        employee_no="1234",
        full_name="Test Person",
        source="acs",
        max_access_times=2,
        access_times_used=0,
        acs_active=1,
        acs_sync_status="synced",
    )
    db.add_all([device, person])
    db.flush()
    issue = CardIssue(
        person_id=person.id,
        device_id=device.id,
        card_number="3010179171",
        status="active",
    )
    db.add(issue)
    db.commit()

    deleted = []

    def delete_from_device(*args, **kwargs):
        deleted.append(kwargs["employee_no"])
        return {"ok": True}

    monkeypatch.setattr(
        acs_access_limit,
        "acs_person_delete_isapi_sync",
        delete_from_device,
    )

    first = {
        "serial_no": 100,
        "employee_no": "1234",
        "minor_type": 75,
        "door_no": 1,
    }
    second = {**first, "serial_no": 101}

    assert acs_access_limit._store_event(db, device, first)
    assert person.access_times_used == 1
    assert person.acs_active == 1

    assert not acs_access_limit._store_event(db, device, first)
    assert person.access_times_used == 1

    assert acs_access_limit._store_event(db, device, second)
    assert person.access_times_used == 2
    assert person.acs_active == 0
    assert person.acs_sync_status == "passive"
    assert issue.status == "revoked"
    assert deleted == ["1234"]
    assert db.query(AcsAccessEvent).count() == 2


def test_denied_access_does_not_consume_limit(monkeypatch):
    db = _session()
    device = AccessControlDevice(
        name="Test controller",
        ip_address="127.0.0.1",
        is_active=1,
    )
    person = Person(
        employee_no="5678",
        source="acs",
        max_access_times=1,
        access_times_used=0,
        acs_active=1,
    )
    db.add_all([device, person])
    db.commit()

    monkeypatch.setattr(
        acs_access_limit,
        "acs_person_delete_isapi_sync",
        lambda *args, **kwargs: {"ok": True},
    )

    assert acs_access_limit._store_event(
        db,
        device,
        {
            "serial_no": 200,
            "employee_no": "5678",
            "minor_type": 76,
            "door_no": 1,
        },
    )
    assert person.access_times_used == 0
    assert person.acs_active == 1


@pytest.mark.parametrize(
    ("minor_type", "verify_mode"),
    [
        (0x01, "card"),
        (0x26, "fingerprint"),
        (0x65, "employeeNoAndPassword"),
        (0x4B, "face"),
    ],
)
def test_each_supported_credential_consumes_access_limit(
    monkeypatch,
    minor_type,
    verify_mode,
):
    db = _session()
    device = AccessControlDevice(
        name="Test controller",
        ip_address="127.0.0.1",
        is_active=1,
    )
    person = Person(
        employee_no="9012",
        source="acs",
        max_access_times=10,
        access_times_used=0,
        acs_active=1,
    )
    db.add_all([device, person])
    db.commit()

    monkeypatch.setattr(
        acs_access_limit,
        "acs_person_delete_isapi_sync",
        lambda *args, **kwargs: {"ok": True},
    )

    assert acs_access_limit._store_event(
        db,
        device,
        {
            "serial_no": 300 + minor_type,
            "employee_no": "9012",
            "minor_type": minor_type,
            "verify_mode": verify_mode,
            "door_no": 1,
        },
    )
    assert person.access_times_used == 1
