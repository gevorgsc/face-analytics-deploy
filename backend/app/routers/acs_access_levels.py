"""ACS Access Levels — named groups of door access rights, assigned to persons."""

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.acs_schedule import (
    build_user_right_week_plan_payload,
    build_user_right_holiday_plan_payload,
    default_schedule_config,
    schedule_is_active,
    schedule_summary,
    user_right_holiday_plan_matches,
    user_right_week_plan_matches,
    validate_schedule_config,
)
from app.db import get_db
from app.models import (
    AccessLevel,
    AccessLevelMember,
    AccessControlDevice,
    AcsHoliday,
    CardIssue,
    Person,
    User,
)
from app.utils import add_audit_log, full_media_path, utc_now, sign_media_fields
from app.acs_person_service import (
    _person_card_numbers,
    synchronize_person_background,
)
from app.isapi_acs import (
    user_right_plan_template_get_isapi,
    user_right_plan_template_set_isapi,
    user_right_holiday_group_set_isapi,
    user_right_holiday_group_get_isapi,
    user_right_holiday_plan_get_isapi,
    user_right_holiday_plan_set_isapi,
    user_right_week_plan_get_isapi,
    user_right_week_plan_set_isapi,
)
from app.secrets import decrypt_camera_password
from app.ws_manager import manager as ws_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/acs/levels", tags=["acs_access_levels"])
_executor = ThreadPoolExecutor(max_workers=4)


def _validated_door_rules(db: Session, value) -> list[dict]:
    rules = value
    if isinstance(rules, str):
        try:
            rules = json.loads(rules)
        except json.JSONDecodeError:
            raise HTTPException(400, "door_rules must be valid JSON")
    if not isinstance(rules, list):
        raise HTTPException(400, "door_rules must be a list")

    normalized = []
    seen = set()
    for rule in rules:
        device_id = int(rule.get("device_id") or 0)
        device = db.get(AccessControlDevice, device_id)
        if not device:
            raise HTTPException(400, f"Controller {device_id} does not exist")
        doors = set()
        for raw_door in (rule.get("door_numbers") or []):
            try:
                door = int(raw_door)
            except (TypeError, ValueError):
                raise HTTPException(400, f"Invalid door number for controller {device.name}")
            if door < 1 or door > (device.door_count or 1):
                raise HTTPException(
                    400,
                    f"Door {door} is outside controller {device.name}'s configured range",
                )
            doors.add(door)
        doors = sorted(doors)
        if not doors:
            continue
        key = (device_id, tuple(doors))
        if key in seen:
            continue
        seen.add(key)
        normalized.append({"device_id": device_id, "door_numbers": doors})
    return normalized


def _ensure_unique_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    query = db.query(AccessLevel).filter(AccessLevel.name.ilike(name))
    if exclude_id is not None:
        query = query.filter(AccessLevel.id != exclude_id)
    if query.first():
        raise HTTPException(409, f'Access level "{name}" already exists')


def _level_holiday_deployments(
    db: Session,
    level: AccessLevel,
    schedule: dict,
    year: int,
) -> list[dict]:
    deployments = []
    seen_dates = set()
    for holiday in db.query(AcsHoliday).order_by(AcsHoliday.date, AcsHoliday.id).all():
        raw_date = str(holiday.date or "").strip()
        concrete_date = f"{year}-{raw_date}" if holiday.is_recurring else raw_date
        try:
            parsed = datetime.strptime(concrete_date, "%Y-%m-%d").date()
        except ValueError:
            continue
        if parsed.year != year or concrete_date in seen_dates:
            continue
        try:
            overrides = json.loads(holiday.access_overrides or "{}")
        except (TypeError, json.JSONDecodeError):
            overrides = {}
        policy = overrides.get(str(level.id), schedule["holiday_mode"])
        if policy not in {"allow", "deny"}:
            continue
        seen_dates.add(concrete_date)
        deployments.append({
            "holiday_id": holiday.id,
            "name": holiday.name,
            "date": concrete_date,
            "policy": policy,
        })
    if len(deployments) > 16:
        raise HTTPException(
            409,
            "A controller holiday group supports at most 16 holidays per access level",
        )
    return deployments


def _person_sync_context(db: Session, person: Person):
    members = db.query(AccessLevelMember).filter(
        AccessLevelMember.person_id == person.id,
    ).all()
    level_ids = {member.access_level_id for member in members}
    door_numbers_by_device: dict[int, set[int]] = {}
    if level_ids:
        levels = db.query(AccessLevel).filter(
            AccessLevel.id.in_(level_ids),
            AccessLevel.is_active == 1,
        ).all()
        for level in levels:
            for rule in json.loads(level.door_rules or "[]"):
                device_id = int(rule.get("device_id") or 0)
                if device_id:
                    door_numbers_by_device.setdefault(device_id, set()).update(
                        int(door) for door in (rule.get("door_numbers") or [1])
                    )
    normalized_doors = {
        device_id: sorted(doors)
        for device_id, doors in door_numbers_by_device.items()
    }
    photo = None
    if person.preview_image:
        try:
            with open(full_media_path(person.preview_image), "rb") as image_file:
                photo = image_file.read()
        except OSError:
            pass
    previous_device_ids = {
        row.device_id
        for row in db.query(CardIssue).filter(
            CardIssue.person_id == person.id,
            CardIssue.status == "active",
        ).all()
    }
    return sorted(normalized_doors), normalized_doors, photo, previous_device_ids


def _queue_person_sync(db: Session, person: Person, background_tasks: BackgroundTasks) -> None:
    device_ids, doors, photo, previous_device_ids = _person_sync_context(db, person)
    person.acs_sync_status = "pending" if device_ids else "local"
    person.acs_sync_error = None
    db.commit()
    background_tasks.add_task(
        synchronize_person_background,
        _executor,
        ws_manager,
        person.id,
        _person_card_numbers(person),
        device_ids,
        doors,
        photo,
        previous_device_ids,
        True,
    )


def _serialize_level(lv: AccessLevel, member_count: int = 0) -> dict:
    try:
        schedule = validate_schedule_config(json.loads(lv.schedule_config or "{}"))
    except (TypeError, json.JSONDecodeError, HTTPException):
        schedule = default_schedule_config()
    return {
        "id":           lv.id,
        "name":         lv.name,
        "description":  lv.description,
        "color":        lv.color,
        "door_rules":   json.loads(lv.door_rules or "[]"),
        "schedule_config": schedule,
        "schedule_summary": schedule_summary(schedule),
        "schedule_active_now": schedule_is_active(schedule),
        "controller_plan_mapped": schedule.get("controller_plan_template_no") is not None,
        # Current ISAPI provisioning uses the built-in 24/7 plan template 1.
        "controller_schedule_synced": schedule.get("controller_plan_template_no") == 1,
        "is_active":    bool(lv.is_active),
        "member_count": member_count,
        "created_at":   lv.created_at,
    }


def _serialize_member(m: AccessLevelMember) -> dict:
    p = m.person
    row = {
        "id":               m.id,
        "access_level_id":  m.access_level_id,
        "person_id":        m.person_id,
        "person_name":      p.full_name if p else None,
        "department":       p.department if p else None,
        "person_type":      p.person_type if p else None,
        "preview_image":    p.preview_image if p else None,
        "card_number":      p.card_number if p else None,
        "valid_from":       m.valid_from,
        "valid_to":         m.valid_to,
        "created_at":       m.created_at,
    }
    return sign_media_fields(row)


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("")
def list_levels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    levels = db.query(AccessLevel).order_by(AccessLevel.name).all()
    result = []
    for lv in levels:
        cnt = db.query(AccessLevelMember).filter(AccessLevelMember.access_level_id == lv.id).count()
        result.append(_serialize_level(lv, cnt))
    return result


@router.post("")
def create_level(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    name = (data.get("name") or "").strip()
    if not name: raise HTTPException(400, "name is required")
    _ensure_unique_name(db, name)

    door_rules = _validated_door_rules(db, data.get("door_rules", []))
    schedule = validate_schedule_config(data.get("schedule_config"))

    now = utc_now()
    lv = AccessLevel(
        name        = name,
        description = data.get("description") or None,
        color       = data.get("color") or "#3B82F6",
        door_rules  = json.dumps(door_rules),
        schedule_config = json.dumps(schedule),
        is_active   = 1 if data.get("is_active", True) else 0,
        created_at  = now,
        updated_at  = now,
    )
    db.add(lv)
    db.commit()
    db.refresh(lv)

    add_audit_log(db, current_user, "ACCESS_LEVEL_CREATED", "access_level", lv.id,
                  f"Created level: {lv.name}", request.client.host if request.client else None)
    return _serialize_level(lv)


@router.patch("/{level_id}")
def update_level(
    request: Request,
    level_id: int,
    data: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    lv = db.get(AccessLevel, level_id)
    if not lv: raise HTTPException(404, "Access level not found")

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(400, "name is required")
        _ensure_unique_name(db, name, level_id)
        lv.name = name
    if "description" in data: lv.description = data["description"] or None
    if "color"       in data: lv.color       = data["color"] or "#3B82F6"
    if "is_active"   in data: lv.is_active   = 1 if data["is_active"] else 0
    if "door_rules"  in data:
        lv.door_rules = json.dumps(_validated_door_rules(db, data["door_rules"]))
    if "schedule_config" in data:
        lv.schedule_config = json.dumps(validate_schedule_config(data["schedule_config"]))

    lv.updated_at = utc_now()
    db.commit()
    db.refresh(lv)
    if "door_rules" in data or "schedule_config" in data or "is_active" in data:
        members = db.query(AccessLevelMember).options(
            joinedload(AccessLevelMember.person),
        ).filter(AccessLevelMember.access_level_id == level_id).all()
        for member in members:
            if member.person:
                _queue_person_sync(db, member.person, background_tasks)
    cnt = db.query(AccessLevelMember).filter(AccessLevelMember.access_level_id == level_id).count()
    return _serialize_level(lv, cnt)


@router.post("/{level_id}/verify-schedule")
def verify_level_schedule(
    level_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """Read controller plan templates referenced by an access level."""
    level = db.get(AccessLevel, level_id)
    if not level:
        raise HTTPException(404, "Access level not found")
    schedule = validate_schedule_config(json.loads(level.schedule_config or "{}"))
    holiday_year = date.today().year
    holiday_deployments = _level_holiday_deployments(
        db,
        level,
        schedule,
        holiday_year,
    )
    plan_no = schedule.get("controller_plan_template_no")
    if plan_no is None:
        return {
            "ok": False,
            "level_id": level.id,
            "plan_template_no": None,
            "message": "Map this schedule to a controller plan template first",
            "controllers": [],
        }

    controllers = []
    seen_devices = set()
    for rule in json.loads(level.door_rules or "[]"):
        device_id = int(rule.get("device_id") or 0)
        if not device_id or device_id in seen_devices:
            continue
        seen_devices.add(device_id)
        device = db.get(AccessControlDevice, device_id)
        if not device:
            controllers.append({
                "device_id": device_id,
                "ok": False,
                "message": "Controller not found",
            })
            continue
        if not device.is_active:
            controllers.append({
                "device_id": device.id,
                "device_name": device.name,
                "ok": False,
                "message": "Controller is disabled",
            })
            continue
        password = decrypt_camera_password(device.password or "")
        result = user_right_plan_template_get_isapi(
            device.ip_address,
            device.http_port or 80,
            device.username or "admin",
            password,
            plan_no,
        )
        week_result = None
        matches_schedule = False
        if result.get("ok") and result.get("week_plan_no"):
            week_result = user_right_week_plan_get_isapi(
                device.ip_address,
                device.http_port or 80,
                device.username or "admin",
                password,
                int(result["week_plan_no"]),
            )
            if week_result.get("ok"):
                matches_schedule = user_right_week_plan_matches(
                    build_user_right_week_plan_payload(schedule),
                    week_result["payload"],
                )
        holiday_checks = []
        holiday_group = None
        holidays_match = not holiday_deployments
        if result.get("ok") and holiday_deployments:
            group_no = result.get("holiday_group_no")
            if group_no not in (None, ""):
                holiday_group = user_right_holiday_group_get_isapi(
                    device.ip_address,
                    device.http_port or 80,
                    device.username or "admin",
                    password,
                    int(group_no),
                )
                group_payload = holiday_group.get("payload", {}).get(
                    "UserRightHolidayGroupCfg",
                    {},
                )
                actual_numbers = {
                    int(value)
                    for value in str(group_payload.get("holidayPlanNo") or "").split(",")
                    if value.strip().isdigit()
                }
                expected_numbers = {
                    (plan_no - 1) * 16 + index + 1
                    for index in range(len(holiday_deployments))
                }
                if holiday_group.get("ok") and actual_numbers == expected_numbers:
                    for index, holiday in enumerate(holiday_deployments):
                        holiday_plan_no = (plan_no - 1) * 16 + index + 1
                        check = user_right_holiday_plan_get_isapi(
                            device.ip_address,
                            device.http_port or 80,
                            device.username or "admin",
                            password,
                            holiday_plan_no,
                        )
                        check["matches_schedule"] = (
                            check.get("ok")
                            and user_right_holiday_plan_matches(
                                build_user_right_holiday_plan_payload(
                                    holiday["date"],
                                    holiday["policy"],
                                ),
                                check["payload"],
                            )
                        )
                        holiday_checks.append(check)
                    holidays_match = bool(holiday_checks) and all(
                        item.get("matches_schedule")
                        for item in holiday_checks
                    )
        matches_schedule = matches_schedule and holidays_match
        controllers.append({
            "device_id": device.id,
            "device_name": device.name,
            **result,
            "week_plan": week_result,
            "holiday_group": holiday_group,
            "holiday_plans": holiday_checks,
            "holiday_year": holiday_year,
            "matches_schedule": matches_schedule,
            "ok": bool(result.get("ok") and week_result and week_result.get("ok") and matches_schedule),
        })

    ok = bool(controllers) and all(item.get("ok") for item in controllers)
    return {
        "ok": ok,
        "level_id": level.id,
        "plan_template_no": plan_no,
        "message": (
            "Plan template verified on every controller"
            if ok
            else "Plan template verification failed on one or more controllers"
        ),
        "controllers": controllers,
    }


@router.post("/{level_id}/deploy-schedule")
def deploy_level_schedule(
    request: Request,
    level_id: int,
    data: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Explicitly deploy a weekly plan and plan template to level controllers."""
    if data.get("confirm") is not True:
        raise HTTPException(400, "confirm=true is required")
    level = db.get(AccessLevel, level_id)
    if not level:
        raise HTTPException(404, "Access level not found")
    schedule = validate_schedule_config(json.loads(level.schedule_config or "{}"))
    plan_no = schedule.get("controller_plan_template_no")
    if plan_no is None:
        raise HTTPException(409, "Map the schedule to controller plan 2-128 first")
    if plan_no == 1:
        raise HTTPException(409, "Controller plan 1 is reserved for built-in 24/7 access")
    if plan_no > 128:
        raise HTTPException(409, "Automatic deployment supports controller plans 2-128")
    holiday_year = int(data.get("holiday_year") or date.today().year)
    if holiday_year < 2000 or holiday_year > 2037:
        raise HTTPException(400, "holiday_year must be between 2000 and 2037")
    holiday_deployments = _level_holiday_deployments(
        db,
        level,
        schedule,
        holiday_year,
    )
    if schedule["holiday_mode"] in {"allow", "deny"} and not holiday_deployments:
        raise HTTPException(409, f"No holidays are configured for {holiday_year}")
    if holiday_deployments and plan_no > 64:
        raise HTTPException(
            409,
            "Holiday deployment requires controller plan 2-64",
        )

    week_payload = build_user_right_week_plan_payload(schedule)
    controllers = []
    seen_devices = set()
    for rule in json.loads(level.door_rules or "[]"):
        device_id = int(rule.get("device_id") or 0)
        if not device_id or device_id in seen_devices:
            continue
        seen_devices.add(device_id)
        device = db.get(AccessControlDevice, device_id)
        if not device or not device.is_active:
            controllers.append({
                "device_id": device_id,
                "device_name": device.name if device else None,
                "ok": False,
                "message": "Controller not found or disabled",
            })
            continue
        password = decrypt_camera_password(device.password or "")
        week_result = user_right_week_plan_set_isapi(
            device.ip_address,
            device.http_port or 80,
            device.username or "admin",
            password,
            plan_no,
            week_payload,
        )
        holiday_results = []
        holiday_group_result = None
        holiday_plan_numbers = []
        if week_result.get("ok") and holiday_deployments:
            first_holiday_plan = (plan_no - 1) * 16 + 1
            for offset, holiday in enumerate(holiday_deployments):
                holiday_plan_no = first_holiday_plan + offset
                holiday_plan_numbers.append(holiday_plan_no)
                result = user_right_holiday_plan_set_isapi(
                    device.ip_address,
                    device.http_port or 80,
                    device.username or "admin",
                    password,
                    holiday_plan_no,
                    build_user_right_holiday_plan_payload(
                        holiday["date"],
                        holiday["policy"],
                    ),
                )
                holiday_results.append({
                    **holiday,
                    "plan_no": holiday_plan_no,
                    **result,
                })
                if not result.get("ok"):
                    break
            if all(item.get("ok") for item in holiday_results):
                holiday_group_result = user_right_holiday_group_set_isapi(
                    device.ip_address,
                    device.http_port or 80,
                    device.username or "admin",
                    password,
                    plan_no,
                    name=f"{level.name} {holiday_year}",
                    holiday_plan_numbers=holiday_plan_numbers,
                )
        template_result = None
        holiday_ok = (
            not holiday_deployments
            or (
                holiday_results
                and all(item.get("ok") for item in holiday_results)
                and holiday_group_result
                and holiday_group_result.get("ok")
            )
        )
        if week_result.get("ok") and holiday_ok:
            template_result = user_right_plan_template_set_isapi(
                device.ip_address,
                device.http_port or 80,
                device.username or "admin",
                password,
                plan_no,
                name=level.name,
                week_plan_no=plan_no,
                holiday_group_no=plan_no if holiday_deployments else None,
            )
        controllers.append({
            "device_id": device.id,
            "device_name": device.name,
            "ok": bool(week_result.get("ok") and template_result and template_result.get("ok")),
            "week_plan": week_result,
            "holiday_plans": holiday_results,
            "holiday_group": holiday_group_result,
            "plan_template": template_result,
        })

    ok = bool(controllers) and all(item.get("ok") for item in controllers)
    queued_members = []
    if ok and data.get("resync_members", True):
        members = (
            db.query(AccessLevelMember)
            .options(joinedload(AccessLevelMember.person))
            .filter(AccessLevelMember.access_level_id == level.id)
            .all()
        )
        for member in members:
            if member.person and member.person.acs_active:
                _queue_person_sync(db, member.person, background_tasks)
                queued_members.append(member.person_id)

    add_audit_log(
        db,
        current_user,
        "ACCESS_LEVEL_SCHEDULE_DEPLOYED" if ok else "ACCESS_LEVEL_SCHEDULE_DEPLOY_FAILED",
        "access_level",
        level.id,
        f"Plan {plan_no} deployment for '{level.name}' on {len(controllers)} controller(s)",
        request.client.host if request.client else None,
    )
    return {
        "ok": ok,
        "level_id": level.id,
        "plan_template_no": plan_no,
        "controllers": controllers,
        "holiday_year": holiday_year,
        "holidays_deployed": holiday_deployments,
        "queued_members": queued_members,
        "message": (
            "Schedule deployed and member synchronization queued"
            if ok else
            "Schedule deployment failed on one or more controllers"
        ),
    }


@router.delete("/{level_id}")
def delete_level(
    level_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    lv = db.get(AccessLevel, level_id)
    if not lv: raise HTTPException(404, "Access level not found")
    name = lv.name
    people = [
        member.person
        for member in db.query(AccessLevelMember).options(
            joinedload(AccessLevelMember.person),
        ).filter(AccessLevelMember.access_level_id == level_id).all()
        if member.person
    ]
    db.delete(lv)
    db.commit()
    for person in people:
        _queue_person_sync(db, person, background_tasks)
    add_audit_log(db, current_user, "ACCESS_LEVEL_DELETED", "access_level", level_id,
                  f"Deleted level: {name}", request.client.host if request.client else None)
    return {"ok": True}


@router.post("/{level_id}/clone")
def clone_level(
    request: Request,
    level_id: int,
    data: dict = {},
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Clone an access level (copy name, description, color, door_rules — not members)."""
    lv = db.get(AccessLevel, level_id)
    if not lv:
        raise HTTPException(404, "Access level not found")

    new_name = data.get("name") or f"{lv.name} (Copy)"
    now = utc_now()
    clone = AccessLevel(
        name        = new_name,
        description = lv.description,
        color       = lv.color or "#3B82F6",
        door_rules  = lv.door_rules,
        schedule_config = lv.schedule_config,
        is_active   = 1,
        created_at  = now,
        updated_at  = now,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)

    add_audit_log(db, current_user, "ACCESS_LEVEL_CLONED", "access_level", clone.id,
                  f"Cloned from level '{lv.name}' → '{new_name}'",
                  request.client.host if request.client else None)
    return _serialize_level(clone, 0)


# ── Members ───────────────────────────────────────────────────────────────────

@router.get("/{level_id}/members")
def list_members(
    level_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lv = db.get(AccessLevel, level_id)
    if not lv: raise HTTPException(404, "Access level not found")
    members = (
        db.query(AccessLevelMember)
        .options(joinedload(AccessLevelMember.person))
        .filter(AccessLevelMember.access_level_id == level_id)
        .all()
    )
    return [_serialize_member(m) for m in members]


@router.post("/{level_id}/members")
async def add_member(
    request: Request,
    level_id: int,
    data: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """
    Assign a person to an access level.
    Optionally auto-issues cards on all devices in door_rules.
    """
    lv = db.get(AccessLevel, level_id)
    if not lv: raise HTTPException(404, "Access level not found")

    person_id = data.get("person_id")
    if not person_id: raise HTTPException(400, "person_id required")

    person = db.get(Person, person_id)
    if not person: raise HTTPException(404, "Person not found")

    existing = db.query(AccessLevelMember).filter(
        AccessLevelMember.access_level_id == level_id,
        AccessLevelMember.person_id == person_id,
    ).first()
    if existing: raise HTTPException(409, "Person already in this access level")

    now = utc_now()
    m = AccessLevelMember(
        access_level_id = level_id,
        person_id       = person_id,
        valid_from      = datetime.fromisoformat(data["valid_from"]) if data.get("valid_from") else None,
        valid_to        = datetime.fromisoformat(data["valid_to"])   if data.get("valid_to")   else None,
        created_at      = now,
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    _queue_person_sync(db, person, background_tasks)

    add_audit_log(db, current_user, "ACCESS_LEVEL_MEMBER_ADDED", "access_level", level_id,
                  f"Added {person.full_name} to level '{lv.name}' and queued credential sync",
                  request.client.host if request.client else None)

    return {"ok": True, "member": _serialize_member(m), "sync_status": person.acs_sync_status}


@router.delete("/{level_id}/members/{member_id}")
async def remove_member(
    request: Request,
    level_id: int,
    member_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    m = db.query(AccessLevelMember).filter(
        AccessLevelMember.id == member_id,
        AccessLevelMember.access_level_id == level_id,
    ).first()
    if not m: raise HTTPException(404, "Member not found")
    person = m.person
    person_name = m.person.full_name if m.person else str(m.person_id)
    db.delete(m)
    db.commit()
    if person:
        _queue_person_sync(db, person, background_tasks)
    add_audit_log(db, current_user, "ACCESS_LEVEL_MEMBER_REMOVED", "access_level", level_id,
                  f"Removed {person_name} from level",
                  request.client.host if request.client else None)
    return {"ok": True}


# ── Persons not yet in this level (for "add member" dropdown) ─────────────────

@router.get("/{level_id}/available-persons")
def available_persons(
    level_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing_ids = {
        m.person_id for m in
        db.query(AccessLevelMember.person_id)
        .filter(AccessLevelMember.access_level_id == level_id)
        .all()
    }
    persons = (
        db.query(Person)
        .filter(Person.full_name.isnot(None), Person.person_type != "unknown")
        .order_by(Person.full_name)
        .all()
    )
    return [
        sign_media_fields({
            "id":           p.id,
            "full_name":    p.full_name,
            "person_type":  p.person_type,
            "department":   p.department,
            "card_number":  p.card_number,
            "preview_image":p.preview_image,
            "already_member": p.id in existing_ids,
        })
        for p in persons
    ]
