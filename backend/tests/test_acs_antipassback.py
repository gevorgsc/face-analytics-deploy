from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import (
    AccessControlDevice,
    AntiPassbackRule,
    AntiPassbackState,
    AntiPassbackViolation,
    Person,
)
from app.routers.acs_anti_passback import (
    check_and_update,
    create_rule,
    list_rules,
    list_violations,
)
from app.utils import utc_now


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_create_rule_accepts_paired_door_frontend_contract():
    db = _session()
    device = AccessControlDevice(
        name="Main",
        ip_address="127.0.0.1",
        door_count=2,
    )
    db.add(device)
    db.commit()

    result = create_rule({
        "device_id": device.id,
        "door_no_in": 1,
        "door_no_out": 2,
        "reset_hours": 12,
        "mode": "hard",
    }, db, None)

    assert result["door_no_in"] == 1
    assert result["door_no_out"] == 2
    assert result["reset_hours"] == 12
    assert list_rules(db, None)[0]["mode"] == "hard"


def test_hard_antipassback_denies_repeated_entry_and_allows_exit():
    db = _session()
    device = AccessControlDevice(
        name="Main",
        ip_address="127.0.0.1",
        door_count=2,
    )
    person = Person(employee_no="100", full_name="Test")
    db.add_all([device, person])
    db.flush()
    rule = AntiPassbackRule(
        device_id=device.id,
        door_no=1,
        door_no_in=1,
        door_no_out=2,
        reset_hours=12,
        mode="hard",
        is_active=1,
    )
    db.add(rule)
    db.commit()

    first_entry = check_and_update(db, person.id, device.id, 1, card_number="123")
    repeated_entry = check_and_update(db, person.id, device.id, 1, card_number="123")
    exit_result = check_and_update(db, person.id, device.id, 2, card_number="123")
    next_entry = check_and_update(db, person.id, device.id, 1, card_number="123")

    assert first_entry["allowed"] is True
    assert repeated_entry == {
        "allowed": False,
        "mode": "hard",
        "violation": True,
        "rule_id": rule.id,
        "direction": "in",
    }
    assert exit_result["allowed"] is True
    assert exit_result["direction"] == "out"
    assert next_entry["allowed"] is True
    violation = db.query(AntiPassbackViolation).one()
    assert violation.card_number == "123"
    assert list_violations(100, db, None)[0]["device_name"] == "Main"


def test_antipassback_state_expires_after_reset_window():
    db = _session()
    device = AccessControlDevice(
        name="Main",
        ip_address="127.0.0.1",
        door_count=2,
    )
    person = Person(employee_no="100", full_name="Test")
    db.add_all([device, person])
    db.flush()
    rule = AntiPassbackRule(
        device_id=device.id,
        door_no=1,
        door_no_in=1,
        door_no_out=2,
        reset_hours=1,
        mode="hard",
        is_active=1,
    )
    db.add(rule)
    db.flush()
    db.add(AntiPassbackState(
        person_id=person.id,
        device_id=device.id,
        rule_id=rule.id,
        door_no=1,
        last_direction="in",
        last_event_at=utc_now() - timedelta(hours=2),
    ))
    db.commit()

    result = check_and_update(db, person.id, device.id, 1)

    assert result["allowed"] is True
    assert db.query(AntiPassbackViolation).count() == 0
