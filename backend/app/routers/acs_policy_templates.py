"""Feature 12: Access Policy Templates — clone door rules to access levels."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.acs_schedule import validate_schedule_config
from app.db import get_db
from app.models import AccessLevel, AccessPolicyTemplate, User
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/policy-templates", tags=["acs_policy_templates"])


def _tpl_out(t: AccessPolicyTemplate) -> dict:
    return {
        "id": t.id, "name": t.name, "description": t.description,
        "door_rules": json.loads(t.door_rules or "[]"),
        "schedule_config": json.loads(t.schedule_config or "{}"),
        "tags": [x.strip() for x in (t.tags or "").split(",") if x.strip()],
        "is_active": bool(t.is_active),
        "created_at": t.created_at, "updated_at": t.updated_at,
    }


@router.get("")
def list_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [_tpl_out(t) for t in db.query(AccessPolicyTemplate).order_by(AccessPolicyTemplate.name).all()]


@router.post("")
def create_template(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not data.get("name"):
        raise HTTPException(400, "name is required")
    tpl = AccessPolicyTemplate(
        name=data["name"].strip(),
        description=data.get("description"),
        door_rules=json.dumps(data.get("door_rules") or []),
        schedule_config=json.dumps(validate_schedule_config(data.get("schedule_config"))),
        tags=",".join(data.get("tags") or []),
        is_active=1 if data.get("is_active", True) else 0,
    )
    db.add(tpl); db.commit(); db.refresh(tpl)
    return _tpl_out(tpl)


@router.patch("/{tpl_id}")
def update_template(
    tpl_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    tpl = db.get(AccessPolicyTemplate, tpl_id)
    if not tpl:
        raise HTTPException(404, "Template not found")
    if "name" in data:
        tpl.name = data["name"].strip()
    if "description" in data:
        tpl.description = data["description"]
    if "door_rules" in data:
        tpl.door_rules = json.dumps(data["door_rules"])
    if "schedule_config" in data:
        tpl.schedule_config = json.dumps(validate_schedule_config(data["schedule_config"]))
    if "tags" in data:
        tpl.tags = ",".join(data["tags"]) if isinstance(data["tags"], list) else data["tags"]
    if "is_active" in data:
        tpl.is_active = 1 if data["is_active"] else 0
    tpl.updated_at = utc_now()
    db.commit(); db.refresh(tpl)
    return _tpl_out(tpl)


@router.delete("/{tpl_id}")
def delete_template(
    tpl_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    tpl = db.get(AccessPolicyTemplate, tpl_id)
    if not tpl:
        raise HTTPException(404, "Template not found")
    db.delete(tpl); db.commit()
    return {"ok": True}


@router.post("/{tpl_id}/apply/{level_id}")
def apply_template_to_level(
    tpl_id: int, level_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Apply (clone) a template's door_rules to an existing access level."""
    tpl = db.get(AccessPolicyTemplate, tpl_id)
    if not tpl:
        raise HTTPException(404, "Template not found")
    level = db.get(AccessLevel, level_id)
    if not level:
        raise HTTPException(404, "Access level not found")

    merge = data.get("merge", False)  # if True, merge; if False, replace
    if merge:
        existing = json.loads(level.door_rules or "[]")
        new_rules = json.loads(tpl.door_rules or "[]")
        # Merge by device_id: new rules override existing for same device
        existing_by_device = {r["device_id"]: r for r in existing if "device_id" in r}
        for rule in new_rules:
            existing_by_device[rule.get("device_id")] = rule
        level.door_rules = json.dumps(list(existing_by_device.values()))
    else:
        level.door_rules = tpl.door_rules
    level.schedule_config = json.dumps(
        validate_schedule_config(json.loads(tpl.schedule_config or "{}"))
    )

    level.updated_at = utc_now()
    db.commit()

    return {
        "ok": True,
        "level_id": level_id,
        "level_name": level.name,
        "template_id": tpl_id,
        "template_name": tpl.name,
        "merge": merge,
        "door_rules_applied": json.loads(level.door_rules or "[]"),
        "schedule_config_applied": json.loads(level.schedule_config or "{}"),
    }


@router.post("/{tpl_id}/clone-from-level/{level_id}")
def clone_from_level(
    tpl_id: int, level_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Capture current access level rules into a template (reverse apply)."""
    tpl   = db.get(AccessPolicyTemplate, tpl_id)
    level = db.get(AccessLevel, level_id)
    if not tpl or not level:
        raise HTTPException(404, "Template or access level not found")
    tpl.door_rules  = level.door_rules
    tpl.schedule_config = level.schedule_config
    tpl.updated_at  = utc_now()
    db.commit()
    return _tpl_out(tpl)
