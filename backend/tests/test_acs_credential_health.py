import asyncio
import json
from datetime import datetime, timedelta

from fastapi import BackgroundTasks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import (
    AccessControlDevice,
    AccessLevel,
    AccessLevelMember,
    CardIssue,
    Person,
)
from app.routers import acs_credential_health


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_credential_health_reports_coverage_and_issues():
    db = _session()
    device = AccessControlDevice(name="Main", ip_address="10.0.0.2")
    level = AccessLevel(name="Employees", door_rules="[]")
    healthy = Person(
        employee_no="E-1",
        full_name="Healthy Person",
        preview_image="media/face.jpg",
        card_number="1001",
        fingerprints=json.dumps([{"finger_no": 1, "template": "YQ=="}]),
        pin_code="1234",
        acs_sync_status="synced",
        acs_active=1,
    )
    failed = Person(
        employee_no="E-2",
        full_name="Failed Person",
        acs_sync_status="error",
        acs_sync_error="controller offline",
        acs_active=1,
    )
    db.add_all([device, level, healthy, failed])
    db.flush()
    db.add(AccessLevelMember(access_level_id=level.id, person_id=healthy.id))
    db.add(CardIssue(
        person_id=healthy.id,
        device_id=device.id,
        card_number="1001",
        status="active",
    ))
    db.commit()

    result = acs_credential_health.credential_health(
        issue=None,
        search=None,
        limit=200,
        db=db,
        current_user=None,
    )

    assert result["summary"]["total_persons"] == 2
    assert result["summary"]["configured"] == 1
    assert result["summary"]["failed"] == 1
    assert result["credentials"]["face"] == {"configured": 1, "missing": 1}
    failed_row = next(row for row in result["persons"] if row["employee_no"] == "E-2")
    assert {"missing_face", "missing_card", "missing_access_level", "sync_failed"} <= set(
        failed_row["issues"]
    )


def test_credential_health_issue_filter_keeps_full_summary():
    db = _session()
    db.add_all([
        Person(employee_no="E-1", full_name="Ready", preview_image="face.jpg", acs_sync_status="synced"),
        Person(employee_no="E-2", full_name="No Face", acs_sync_status="local"),
    ])
    db.commit()

    result = acs_credential_health.credential_health(
        issue="missing_face",
        search=None,
        limit=200,
        db=db,
        current_user=None,
    )

    assert result["summary"]["total_persons"] == 2
    assert result["returned"] == 1
    assert result["persons"][0]["full_name"] == "No Face"


def test_retry_credential_sync_queues_failed_person(monkeypatch):
    db = _session()
    person = Person(
        employee_no="E-1",
        full_name="Retry Person",
        acs_sync_status="error",
        acs_active=1,
        valid_from=datetime.now() - timedelta(days=1),
        valid_to=datetime.now() + timedelta(days=30),
    )
    db.add(person)
    db.commit()
    queued = []

    monkeypatch.setattr(
        acs_credential_health,
        "_person_sync_context",
        lambda _db, _person: ([7], {7: [1]}, b"photo"),
    )
    monkeypatch.setattr(
        acs_credential_health,
        "_queue_person_sync",
        lambda target, tasks, device_ids, doors, photo: queued.append(target.id),
    )

    result = asyncio.run(acs_credential_health.retry_credential_sync(
        {"all_failed": True},
        BackgroundTasks(),
        db,
        None,
    ))

    assert result["queued"] == [person.id]
    assert queued == [person.id]
    assert db.get(Person, person.id).acs_sync_status == "pending"


def test_retry_skips_person_with_unmapped_schedule(monkeypatch):
    db = _session()
    person = Person(
        employee_no="E-3",
        full_name="Schedule Problem",
        acs_sync_status="error",
        acs_active=1,
    )
    db.add(person)
    db.commit()
    queued = []

    monkeypatch.setattr(
        acs_credential_health,
        "_person_sync_context",
        lambda _db, _person: ([7], {7: [1]}, None),
    )
    monkeypatch.setattr(
        acs_credential_health,
        "resolve_person_right_plans",
        lambda _db, _person_id: ({}, [{
            "type": "schedule_unmapped",
            "device_id": 7,
            "door_no": 1,
        }]),
    )
    monkeypatch.setattr(
        acs_credential_health,
        "_queue_person_sync",
        lambda *args: queued.append(True),
    )

    result = asyncio.run(acs_credential_health.retry_credential_sync(
        {"person_ids": [person.id]},
        BackgroundTasks(),
        db,
        None,
    ))

    assert result["queued_count"] == 0
    assert result["skipped"][0]["schedule_issues"][0]["type"] == "schedule_unmapped"
    assert queued == []
