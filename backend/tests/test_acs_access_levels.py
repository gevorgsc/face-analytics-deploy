import json
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import AccessControlDevice, AccessLevel, AccessLevelMember, Person
from app.routers.acs_access_levels import (
    _ensure_unique_name,
    _person_sync_context,
    _serialize_level,
    _validated_door_rules,
)
from app.acs_schedule import schedule_is_active, schedule_summary, validate_schedule_config


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_access_level_rules_validate_devices_and_door_numbers():
    db = _session()
    device = AccessControlDevice(name="Main", ip_address="127.0.0.1", door_count=2)
    db.add(device)
    db.commit()

    assert _validated_door_rules(db, [
        {"device_id": device.id, "door_numbers": [2, 1, 2]},
    ]) == [{"device_id": device.id, "door_numbers": [1, 2]}]

    with pytest.raises(HTTPException, match="outside controller"):
        _validated_door_rules(db, [{"device_id": device.id, "door_numbers": [9]}])

    with pytest.raises(HTTPException, match="does not exist"):
        _validated_door_rules(db, [{"device_id": 999, "door_numbers": [1]}])


def test_access_level_name_is_unique():
    db = _session()
    level = AccessLevel(name="Employees", door_rules="[]")
    db.add(level)
    db.commit()

    with pytest.raises(HTTPException) as error:
        _ensure_unique_name(db, "employees")
    assert error.value.status_code == 409
    _ensure_unique_name(db, "Employees", exclude_id=level.id)


def test_person_sync_context_combines_doors_from_all_active_levels():
    db = _session()
    device = AccessControlDevice(name="Main", ip_address="127.0.0.1", door_count=3)
    person = Person(employee_no="100", full_name="Test", source="acs", acs_active=1)
    db.add_all([device, person])
    db.flush()
    first = AccessLevel(
        name="First",
        door_rules=json.dumps([{"device_id": device.id, "door_numbers": [1, 2]}]),
        is_active=1,
    )
    second = AccessLevel(
        name="Second",
        door_rules=json.dumps([{"device_id": device.id, "door_numbers": [2, 3]}]),
        is_active=1,
    )
    db.add_all([first, second])
    db.flush()
    db.add_all([
        AccessLevelMember(access_level_id=first.id, person_id=person.id),
        AccessLevelMember(access_level_id=second.id, person_id=person.id),
    ])
    db.commit()

    device_ids, doors, _, _ = _person_sync_context(db, person)
    assert device_ids == [device.id]
    assert doors == {device.id: [1, 2, 3]}


def test_access_schedule_validates_and_reports_weekday_status():
    schedule = validate_schedule_config({
        "name": "Office",
        "timezone": "Asia/Yerevan",
        "weekly": {
            day: ([{"start": "09:00", "end": "18:00"}] if day in {
                "mon", "tue", "wed", "thu", "fri",
            } else [])
            for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        },
        "holiday_mode": "deny",
        "controller_plan_template_no": 2,
    })

    assert schedule_summary(schedule) == "Weekdays 09:00-18:00"
    assert schedule_is_active(
        schedule,
        datetime(2026, 6, 15, 12, 0, tzinfo=ZoneInfo("Asia/Yerevan")),
    )
    assert not schedule_is_active(
        schedule,
        datetime(2026, 6, 14, 12, 0, tzinfo=ZoneInfo("Asia/Yerevan")),
    )


def test_access_schedule_rejects_overlapping_periods():
    with pytest.raises(HTTPException, match="overlap"):
        validate_schedule_config({
            "weekly": {
                "mon": [
                    {"start": "09:00", "end": "13:00"},
                    {"start": "12:00", "end": "18:00"},
                ],
            },
        })


def test_access_level_serialization_includes_schedule_health():
    level = AccessLevel(
        name="Office",
        door_rules="[]",
        schedule_config=json.dumps({
            "name": "Office",
            "timezone": "Asia/Yerevan",
            "weekly": {
                day: ([{"start": "09:00", "end": "18:00"}] if day in {
                    "mon", "tue", "wed", "thu", "fri",
                } else [])
                for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
            },
            "holiday_mode": "follow_weekly",
            "controller_plan_template_no": None,
        }),
    )

    payload = _serialize_level(level, 3)
    assert payload["schedule_summary"] == "Weekdays 09:00-18:00"
    assert payload["controller_schedule_synced"] is False
    assert payload["member_count"] == 3
