import json
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import hiksdk_client
from app.acs_schedule import (
    build_user_right_holiday_plan_payload,
    build_user_right_week_plan_payload,
    user_right_week_plan_matches,
)
from app.acs_person_service import resolve_person_right_plans
from app.db import Base
from app.hiksdk_client import acs_person_upsert_isapi_sync
from app.isapi_acs import user_right_plan_template_get_isapi
from app.models import (
    AccessControlDevice,
    AccessLevel,
    AccessLevelMember,
    AcsHoliday,
    Person,
)
from app.routers import acs_access_levels


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _schedule(plan_no):
    return json.dumps({
        "name": "Office",
        "timezone": "Asia/Yerevan",
        "weekly": {
            day: [{"start": "09:00", "end": "18:00"}]
            for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        },
        "holiday_mode": "follow_weekly",
        "controller_plan_template_no": plan_no,
    })


def test_resolve_person_right_plans_maps_each_door():
    db = _session()
    device = AccessControlDevice(name="Main", ip_address="127.0.0.1", door_count=2)
    person = Person(employee_no="100", full_name="Test")
    db.add_all([device, person])
    db.flush()
    level = AccessLevel(
        name="Office",
        door_rules=json.dumps([{"device_id": device.id, "door_numbers": [1, 2]}]),
        schedule_config=_schedule(7),
    )
    db.add(level)
    db.flush()
    db.add(AccessLevelMember(access_level_id=level.id, person_id=person.id))
    db.commit()

    plans, issues = resolve_person_right_plans(db, person.id)

    assert plans == {device.id: {1: 7, 2: 7}}
    assert issues == []


def test_resolve_person_right_plans_rejects_unmapped_and_conflicting_levels():
    db = _session()
    device = AccessControlDevice(name="Main", ip_address="127.0.0.1", door_count=1)
    person = Person(employee_no="100", full_name="Test")
    db.add_all([device, person])
    db.flush()
    levels = [
        AccessLevel(
            name="Unmapped",
            door_rules=json.dumps([{"device_id": device.id, "door_numbers": [1]}]),
            schedule_config=_schedule(None),
        ),
        AccessLevel(
            name="Plan 2",
            door_rules=json.dumps([{"device_id": device.id, "door_numbers": [1]}]),
            schedule_config=_schedule(2),
        ),
        AccessLevel(
            name="Plan 3",
            door_rules=json.dumps([{"device_id": device.id, "door_numbers": [1]}]),
            schedule_config=_schedule(3),
        ),
    ]
    db.add_all(levels)
    db.flush()
    db.add_all([
        AccessLevelMember(access_level_id=level.id, person_id=person.id)
        for level in levels
    ])
    db.commit()

    plans, issues = resolve_person_right_plans(db, person.id)

    assert plans == {}
    assert {issue["type"] for issue in issues} == {
        "schedule_unmapped",
    }

    levels[0].is_active = 0
    db.commit()
    plans, issues = resolve_person_right_plans(db, person.id)
    assert plans == {}
    assert {issue["type"] for issue in issues} == {"schedule_conflict"}


def test_person_provisioning_sends_resolved_right_plans(monkeypatch):
    captured = {}

    class Response:
        ok = True
        status_code = 200

        @staticmethod
        def json():
            return {"statusCode": 1}

    def fake_put(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs["json"]
        return Response()

    monkeypatch.setattr(hiksdk_client.requests, "put", fake_put)

    result = acs_person_upsert_isapi_sync(
        "127.0.0.1",
        80,
        "admin",
        "secret",
        employee_no="100",
        full_name="Test",
        door_numbers=[1, 2],
        right_plans={1: 4, 2: 7},
    )

    assert result["ok"] is True
    assert captured["json"]["UserInfo"]["RightPlan"] == [
        {"doorNo": 1, "planTemplateNo": "4"},
        {"doorNo": 2, "planTemplateNo": "7"},
    ]


def test_person_provisioning_fails_closed_without_door_plan(monkeypatch):
    called = False

    def fake_put(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(hiksdk_client.requests, "put", fake_put)

    result = acs_person_upsert_isapi_sync(
        "127.0.0.1",
        80,
        "admin",
        "secret",
        employee_no="100",
        full_name="Test",
        door_numbers=[1, 2],
        right_plans={1: 4},
    )

    assert result["ok"] is False
    assert result["schedule_error"] == "unmapped"
    assert called is False


def test_plan_template_verification_reads_enabled_template(monkeypatch):
    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "UserRightPlanTemplate": {
                    "enable": True,
                    "templateName": "Office Hours",
                    "weekPlanNo": 3,
                    "holidayGroupNo": 2,
                }
            }

    monkeypatch.setattr(
        "app.isapi_acs.requests.get",
        lambda *args, **kwargs: Response(),
    )

    result = user_right_plan_template_get_isapi(
        "127.0.0.1",
        80,
        "admin",
        "secret",
        7,
    )

    assert result == {
        "ok": True,
        "exists": True,
        "enabled": True,
        "template_no": 7,
        "template_name": "Office Hours",
        "week_plan_no": 3,
        "holiday_group_no": 2,
        "message": "ok",
    }


def test_week_plan_payload_contains_all_controller_slots():
    payload = build_user_right_week_plan_payload(json.loads(_schedule(7)))
    entries = payload["UserRightWeekPlanCfg"]["WeekPlanCfg"]

    assert len(entries) == 56
    monday = entries[:8]
    assert monday[0] == {
        "week": "Monday",
        "id": 1,
        "enable": True,
        "TimeSegment": {
            "beginTime": "09:00:00",
            "endTime": "18:00:00",
        },
        "authenticationTimesEnabled": False,
        "authenticationTimes": 0,
    }
    assert monday[1]["enable"] is False
    assert user_right_week_plan_matches(payload, payload)


def test_all_day_week_plan_uses_device_end_of_day():
    schedule = json.loads(_schedule(1))
    for day in schedule["weekly"]:
        schedule["weekly"][day] = [{"start": "00:00", "end": "23:59"}]

    entries = build_user_right_week_plan_payload(schedule)[
        "UserRightWeekPlanCfg"
    ]["WeekPlanCfg"]

    assert entries[0]["TimeSegment"]["endTime"] == "24:00:00"


def test_deploy_level_schedule_writes_week_plan_then_template(monkeypatch):
    db = _session()
    device = AccessControlDevice(
        name="Main",
        ip_address="127.0.0.1",
        door_count=1,
        is_active=1,
    )
    db.add(device)
    db.flush()
    level = AccessLevel(
        name="Office",
        door_rules=json.dumps([{"device_id": device.id, "door_numbers": [1]}]),
        schedule_config=_schedule(7),
    )
    db.add(level)
    db.commit()
    calls = []

    monkeypatch.setattr(acs_access_levels, "decrypt_camera_password", lambda value: "secret")
    monkeypatch.setattr(
        acs_access_levels,
        "user_right_week_plan_set_isapi",
        lambda *args: calls.append(("week", args[4], args[5])) or {"ok": True},
    )
    monkeypatch.setattr(
        acs_access_levels,
        "user_right_plan_template_set_isapi",
        lambda *args, **kwargs: calls.append((
            "template",
            args[4],
            kwargs["week_plan_no"],
        )) or {"ok": True},
    )
    monkeypatch.setattr(acs_access_levels, "add_audit_log", lambda *args, **kwargs: None)

    result = acs_access_levels.deploy_level_schedule(
        SimpleNamespace(client=SimpleNamespace(host="127.0.0.1")),
        level.id,
        {"confirm": True, "resync_members": False},
        BackgroundTasks(),
        db,
        SimpleNamespace(id=1, username="admin"),
    )

    assert result["ok"] is True
    assert calls[0][0:2] == ("week", 7)
    assert len(calls[0][2]["UserRightWeekPlanCfg"]["WeekPlanCfg"]) == 56
    assert calls[1] == ("template", 7, 7)


def test_deploy_level_schedule_protects_builtin_plan_one():
    db = _session()
    level = AccessLevel(
        name="All Day",
        door_rules="[]",
        schedule_config=_schedule(1),
    )
    db.add(level)
    db.commit()

    with pytest.raises(HTTPException, match="reserved"):
        acs_access_levels.deploy_level_schedule(
            SimpleNamespace(client=None),
            level.id,
            {"confirm": True},
            BackgroundTasks(),
            db,
            SimpleNamespace(id=1, username="admin"),
        )


def test_holiday_payload_supports_allow_and_deny():
    allowed = build_user_right_holiday_plan_payload("2026-09-21", "allow")
    denied = build_user_right_holiday_plan_payload("2026-09-21", "deny")

    assert allowed["UserRightHolidayPlanCfg"]["HolidayPlanCfg"][0]["enable"] is True
    assert allowed["UserRightHolidayPlanCfg"]["HolidayPlanCfg"][0]["TimeSegment"]["endTime"] == "24:00:00"
    assert all(
        not item["enable"]
        for item in denied["UserRightHolidayPlanCfg"]["HolidayPlanCfg"]
    )


def test_level_holiday_deployments_expands_recurring_and_override():
    db = _session()
    level = AccessLevel(
        name="Office",
        door_rules="[]",
        schedule_config=_schedule(7),
    )
    db.add(level)
    db.flush()
    db.add_all([
        AcsHoliday(
            name="Recurring",
            date="09-21",
            is_recurring=1,
            access_overrides=json.dumps({str(level.id): "allow"}),
        ),
        AcsHoliday(
            name="One Time",
            date="2026-12-31",
            is_recurring=0,
            access_overrides="{}",
        ),
        AcsHoliday(
            name="Other Year",
            date="2027-01-01",
            is_recurring=0,
            access_overrides="{}",
        ),
    ])
    db.commit()
    schedule = json.loads(_schedule(7))
    schedule["holiday_mode"] = "deny"

    deployments = acs_access_levels._level_holiday_deployments(
        db,
        level,
        schedule,
        2026,
    )

    assert deployments == [
        {
            "holiday_id": deployments[0]["holiday_id"],
            "name": "Recurring",
            "date": "2026-09-21",
            "policy": "allow",
        },
        {
            "holiday_id": deployments[1]["holiday_id"],
            "name": "One Time",
            "date": "2026-12-31",
            "policy": "deny",
        },
    ]
