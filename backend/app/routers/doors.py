"""Door / relay integration router - HTTP triggers on face match."""
import ipaddress
import json
import logging
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import DoorConfig, User
from app.utils import add_audit_log

logger = logging.getLogger(__name__)
router = APIRouter(tags=["doors"])

_ALLOWED_HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


def _validate_trigger_url(url: str) -> None:
    """Reject blank URLs, non-HTTP(S) schemes, and private/loopback IP ranges (SSRF)."""
    if not url:
        raise HTTPException(400, "trigger_url is required")
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise HTTPException(400, "trigger_url must use http or https")
        host = parsed.hostname or ""
        try:
            addr = ipaddress.ip_address(host)
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
                raise HTTPException(400, "trigger_url must not point to a private or loopback address")
        except ValueError:
            pass  # hostname, not a raw IP — allow
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid trigger_url")


def _serialize(door: DoorConfig) -> dict:
    return {
        "id":                door.id,
        "name":              door.name,
        "trigger_url":       door.trigger_url,
        "http_method":       door.http_method,
        "trigger_types":     json.loads(door.trigger_types or '["employee","vip"]'),
        "min_confidence":    door.min_confidence,
        "cooldown_seconds":  door.cooldown_seconds,
        "is_active":         bool(door.is_active),
        "headers":           json.loads(door.headers or "{}"),
        "payload_template":  door.payload_template,
        "last_triggered_at": door.last_triggered_at,
        "last_status_code":  door.last_status_code,
        "created_at":        door.created_at,
        "map_id":            door.map_id,
        "map_x":             door.map_x,
        "map_y":             door.map_y,
    }


@router.get("/api/doors")
def list_doors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [_serialize(d) for d in db.query(DoorConfig).order_by(DoorConfig.id).all()]


@router.post("/api/doors")
def create_door(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    name = (data.get("name") or "").strip()
    url  = (data.get("trigger_url") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")
    _validate_trigger_url(url)
    method = (data.get("http_method") or "POST").upper()
    if method not in _ALLOWED_HTTP_METHODS:
        raise HTTPException(400, f"http_method must be one of {sorted(_ALLOWED_HTTP_METHODS)}")

    types = data.get("trigger_types", ["employee", "vip"])
    door = DoorConfig(
        name             = name,
        trigger_url      = url,
        http_method      = method,
        trigger_types    = json.dumps(types if isinstance(types, list) else ["employee"]),
        min_confidence   = float(data.get("min_confidence", 0.5)),
        cooldown_seconds = int(data.get("cooldown_seconds", 5)),
        is_active        = 1 if data.get("is_active", True) else 0,
        headers          = json.dumps(data.get("headers") or {}),
        payload_template = data.get("payload_template"),
    )
    db.add(door)
    db.commit()
    db.refresh(door)
    add_audit_log(db, current_user, "DOOR_CREATED", "door", door.id,
                  f"Created door: {door.name}", request.client.host if request.client else None)
    return _serialize(door)


@router.patch("/api/doors/{door_id}")
def update_door(
    request: Request,
    door_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    door = db.get(DoorConfig, door_id)
    if not door:
        raise HTTPException(404, "Door not found")

    if "name" in data:          door.name             = data["name"]
    if "trigger_url" in data:
        _validate_trigger_url(data["trigger_url"])
        door.trigger_url = data["trigger_url"]
    if "http_method" in data:
        m = data["http_method"].upper()
        if m not in _ALLOWED_HTTP_METHODS:
            raise HTTPException(400, f"http_method must be one of {sorted(_ALLOWED_HTTP_METHODS)}")
        door.http_method = m
    if "trigger_types" in data:
        t = data["trigger_types"]
        door.trigger_types = json.dumps(t if isinstance(t, list) else [])
    if "min_confidence" in data:   door.min_confidence   = float(data["min_confidence"])
    if "cooldown_seconds" in data: door.cooldown_seconds = int(data["cooldown_seconds"])
    if "is_active" in data:        door.is_active        = 1 if data["is_active"] else 0
    if "headers" in data:          door.headers          = json.dumps(data["headers"] or {})
    if "payload_template" in data: door.payload_template = data["payload_template"]
    if "map_id" in data:           door.map_id           = data["map_id"]
    if "map_x" in data:            door.map_x            = float(data["map_x"]) if data["map_x"] is not None else None
    if "map_y" in data:            door.map_y            = float(data["map_y"]) if data["map_y"] is not None else None

    db.commit()
    db.refresh(door)
    add_audit_log(db, current_user, "DOOR_UPDATED", "door", door.id,
                  f"Updated door: {door.name}", request.client.host if request.client else None)
    return _serialize(door)


@router.delete("/api/doors/{door_id}")
def delete_door(
    request: Request,
    door_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    door = db.get(DoorConfig, door_id)
    if not door:
        raise HTTPException(404, "Door not found")
    name = door.name
    db.delete(door)
    db.commit()
    add_audit_log(db, current_user, "DOOR_DELETED", "door", door_id,
                  f"Deleted door: {name}", request.client.host if request.client else None)
    return {"ok": True}


@router.post("/api/doors/{door_id}/test")
async def test_door(
    door_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """Fire a test HTTP request to the door relay URL."""
    import httpx
    door = db.get(DoorConfig, door_id)
    if not door:
        raise HTTPException(404, "Door not found")

    headers = json.loads(door.headers or "{}")
    payload = {"test": True, "door": door.name, "source": "face_analytics_pro"}

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            method = door.http_method.upper()
            if method not in _ALLOWED_HTTP_METHODS:
                method = "POST"
            fn = getattr(client, method.lower())
            resp = await fn(door.trigger_url, json=payload, headers=headers)
        return {"ok": True, "status_code": resp.status_code, "body": resp.text[:500]}
    except Exception as e:
        return {"ok": False, "error": str(e)}
