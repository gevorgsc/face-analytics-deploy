from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import AccessControlDevice, AcsAccessEvent, Person
from app.routers.access_control import search_acs_events


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _seed(db):
    device = AccessControlDevice(name="Main Entrance", ip_address="10.0.0.5")
    person = Person(employee_no="EMP-7", full_name="Ada Lovelace")
    db.add_all([device, person])
    db.flush()
    now = datetime.utcnow()
    db.add_all([
        AcsAccessEvent(
            device_id=device.id,
            person_id=person.id,
            door_no=1,
            card_number="1007",
            event_type="access_granted",
            verify_mode="face",
            created_at=now,
        ),
        AcsAccessEvent(
            device_id=device.id,
            door_no=2,
            card_number="9999",
            event_type="access_denied",
            verify_mode="card",
            denial_reason="expired_card",
            created_at=now - timedelta(minutes=2),
        ),
    ])
    db.commit()
    return device


def _search(db, **overrides):
    values = {
        "limit": 50,
        "offset": 0,
        "device_id": None,
        "door_no": None,
        "event_type": None,
        "verify_mode": None,
        "query": None,
        "date_from": None,
        "date_to": None,
        "db": db,
        "current_user": None,
    }
    values.update(overrides)
    return search_acs_events(**values)


def test_event_retrieval_searches_person_and_employee_number():
    db = _session()
    _seed(db)

    by_name = _search(db, query="Ada")
    by_employee = _search(db, query="EMP-7")

    assert by_name["total"] == 1
    assert by_employee["events"][0]["employee_no"] == "EMP-7"
    assert by_employee["events"][0]["device_name"] == "Main Entrance"


def test_event_retrieval_filters_and_paginates():
    db = _session()
    device = _seed(db)

    denied = _search(
        db,
        device_id=device.id,
        door_no=2,
        event_type="access_denied",
        verify_mode="card",
        limit=1,
    )
    second_page = _search(db, limit=1, offset=1)

    assert denied["total"] == 1
    assert denied["events"][0]["denial_reason"] == "expired_card"
    assert second_page["total"] == 2
    assert second_page["has_more"] is False
