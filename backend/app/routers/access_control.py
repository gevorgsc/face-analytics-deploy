"""Access Control router - Hikvision ACS device management + door control."""

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import AccessControlDevice, AcsAccessEvent, AuditLog, FaceEvent, Person, User
from app.pagination import normalize_pagination
from app.secrets import decrypt_camera_password, encrypt_camera_password
from app.utils import add_audit_log, full_media_path, sign_media_fields, utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/acs", tags=["access_control"])

_acs_executor = ThreadPoolExecutor(max_workers=4)

DOOR_COMMANDS = {"unlock", "lock", "stay_open", "stay_close"}
CONTROL_MODES = {"sdk", "isapi"}


def _try_load_isapi():
    from app.hiksdk_client import acs_door_control_isapi_sync
    return acs_door_control_isapi_sync


def _try_load_sdk():
    try:
        from app.hiksdk_client import (
            acs_door_control_sync,
            acs_get_status_sync,
            acs_probe_device_sync,
        )
        return acs_door_control_sync, acs_get_status_sync, acs_probe_device_sync
    except Exception as e:
        raise HTTPException(503, f"HCNetSDK not available on this system: {e}")


def _validated_device_values(data: dict, *, partial: bool = False) -> dict:
    values = {}

    if not partial or "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(400, "Device name is required")
        values["name"] = name

    if not partial or "ip_address" in data:
        ip_address = (data.get("ip_address") or "").strip()
        if not ip_address:
            raise HTTPException(400, "IP address is required")
        values["ip_address"] = ip_address

    for field, default in (("sdk_port", 8000), ("http_port", 80)):
        if not partial or field in data:
            try:
                raw_port = data.get(field)
                port = int(default if raw_port in (None, "") else raw_port)
            except (TypeError, ValueError):
                raise HTTPException(400, f"{field} must be a valid port")
            if port < 1 or port > 65535:
                raise HTTPException(400, f"{field} must be between 1 and 65535")
            values[field] = port

    if not partial or "door_count" in data:
        try:
            raw_door_count = data.get("door_count")
            door_count = int(1 if raw_door_count in (None, "") else raw_door_count)
        except (TypeError, ValueError):
            raise HTTPException(400, "door_count must be a number")
        if door_count < 1 or door_count > 32:
            raise HTTPException(400, "door_count must be between 1 and 32")
        values["door_count"] = door_count

    if not partial or "control_mode" in data:
        control_mode = (data.get("control_mode") or "sdk").lower()
        if control_mode not in CONTROL_MODES:
            raise HTTPException(400, "control_mode must be sdk or isapi")
        values["control_mode"] = control_mode

    return values


def _ensure_unique_device(
    db: Session,
    ip_address: str,
    *,
    exclude_device_id: int | None = None,
) -> None:
    query = db.query(AccessControlDevice).filter(
        func.lower(AccessControlDevice.ip_address) == ip_address.lower(),
    )
    if exclude_device_id is not None:
        query = query.filter(AccessControlDevice.id != exclude_device_id)
    duplicate = query.first()
    if duplicate:
        raise HTTPException(
            409,
            f'A device with IP address {ip_address} already exists as "{duplicate.name}"',
        )


def _serialize(device: AccessControlDevice) -> dict:
    return {
        "id":           device.id,
        "name":         device.name,
        "ip_address":   device.ip_address,
        "sdk_port":     device.sdk_port,
        "http_port":    device.http_port,
        "username":     device.username,
        "door_count":   device.door_count,
        "control_mode": device.control_mode or "isapi",
        "location":     device.location,
        "notes":        device.notes,
        "is_active":    bool(device.is_active),
        "created_at":   device.created_at,
        "updated_at":   device.updated_at,
    }


def _serialize_event(ev: AcsAccessEvent) -> dict:
    return sign_media_fields({
        "id":            ev.id,
        "device_id":     ev.device_id,
        "door_no":       ev.door_no,
        "card_number":   ev.card_number,
        "person_id":     ev.person_id,
        "person_name":   ev.person.full_name if ev.person else None,
        "person_type":   ev.person.person_type if ev.person else None,
        "event_type":    ev.event_type,
        "verify_mode":   ev.verify_mode,
        "error_code":    ev.error_code,
        "denial_reason": ev.denial_reason,
        "direction":     ev.direction,
        "preview_image": ev.person.preview_image if ev.person else None,
        "event_image":   None,
        "created_at":    ev.created_at,
    })


def _event_uses_face(event: AcsAccessEvent) -> bool:
    verify_mode = (event.verify_mode or "").lower()
    return (
        "face" in verify_mode
        and verify_mode not in {"manual", "emergency"}
    )


def _serialize_events_with_images(db: Session, events: list[AcsAccessEvent]) -> list[dict]:
    if not events:
        return []

    face_events = [event for event in events if _event_uses_face(event) and event.created_at]
    nearby_faces = []
    if face_events:
        start = min(event.created_at for event in face_events) - timedelta(seconds=20)
        end = max(event.created_at for event in face_events) + timedelta(seconds=20)
        nearby_faces = (
            db.query(FaceEvent)
            .filter(
                FaceEvent.source == "access_controller",
                FaceEvent.created_at >= start,
                FaceEvent.created_at <= end,
                FaceEvent.crop_image_path.isnot(None),
            )
            .all()
        )

    rows = []
    for event in events:
        row = _serialize_event(event)
        preview_path = row.get("preview_image")
        preview_exists = bool(
            preview_path
            and os.path.exists(full_media_path(preview_path.split("?", 1)[0]))
        )
        is_registered_person = bool(
            event.person
            and (event.person.person_type or "").lower() != "unknown"
        )

        if is_registered_person:
            if preview_exists:
                row["event_image"] = row["preview_image"]
                row["image_source"] = "profile"
        elif _event_uses_face(event) and event.created_at:
            serial_marker = (
                f"ACS serial={event.source_serial_no}"
                if event.source_serial_no is not None
                else None
            )
            candidates = [
                face
                for face in nearby_faces
                if serial_marker and face.raw_payload == serial_marker
            ]
            if event.person_id:
                exact = [face for face in candidates if face.person_id == event.person_id]
                if exact:
                    candidates = exact
            if candidates:
                face = min(
                    candidates,
                    key=lambda item: abs((item.created_at - event.created_at).total_seconds()),
                )
                row["event_image"] = face.crop_image_path or face.image_path
                row["image_source"] = "face_event"
        if not preview_exists:
            row["preview_image"] = None
        if not row.get("event_image") and preview_exists:
            row["event_image"] = row["preview_image"]
            row["image_source"] = "profile"
        rows.append(sign_media_fields(row))
    return rows


# ---------------------------------------------------------------------------
# Device CRUD
# ---------------------------------------------------------------------------

@router.get("")
def list_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    devices = db.query(AccessControlDevice).order_by(AccessControlDevice.id).all()
    return [_serialize(d) for d in devices]


@router.post("/probe")
async def probe_device(
    data: dict,
    current_user: User = Depends(require_admin),
):
    ip = (data.get("ip_address") or "").strip()
    username = (data.get("username") or "admin").strip()
    password = data.get("password") or ""
    if not ip or not password:
        raise HTTPException(400, "ip_address and password are required")

    _, _, probe_sdk = _try_load_sdk()
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _acs_executor,
        probe_sdk,
        ip,
        int(data.get("sdk_port") or 8000),
        username,
        password,
    )
    if not result.get("ok"):
        raise HTTPException(400, result.get("message") or "HCNetSDK connection failed")
    return result


@router.post("")
async def create_device(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    values = _validated_device_values(data)
    name = values["name"]
    ip = values["ip_address"]
    _ensure_unique_device(db, ip)

    password_raw = data.get("password") or ""
    control_mode = values["control_mode"]
    connection = None
    if control_mode == "sdk":
        if not password_raw:
            raise HTTPException(400, "password is required for HCNetSDK device registration")
        _, _, probe_sdk = _try_load_sdk()
        loop = asyncio.get_running_loop()
        connection = await loop.run_in_executor(
            _acs_executor,
            probe_sdk,
            ip,
            values["sdk_port"],
            (data.get("username") or "admin").strip(),
            password_raw,
        )
        if not connection.get("ok"):
            raise HTTPException(
                400,
                connection.get("message") or "HCNetSDK connection failed; device was not added",
            )

    device = AccessControlDevice(
        name         = name,
        ip_address   = ip,
        sdk_port     = values["sdk_port"],
        http_port    = values["http_port"],
        username     = (data.get("username") or "admin").strip(),
        password     = encrypt_camera_password(password_raw) if password_raw else None,
        door_count   = values["door_count"],
        control_mode = control_mode,
        location     = (data.get("location") or "").strip() or None,
        notes        = data.get("notes") or None,
        is_active    = 1 if data.get("is_active", True) else 0,
    )
    db.add(device)
    db.commit()
    db.refresh(device)

    add_audit_log(db, current_user, "ACS_DEVICE_CREATED", "acs_device", device.id,
                  f"Created ACS device: {device.name} ({device.ip_address})",
                  request.client.host if request.client else None)

    return {**_serialize(device), "connection": connection}


@router.post("/{device_id}/probe")
async def probe_saved_device(
    device_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    device = db.get(AccessControlDevice, device_id)
    if not device:
        raise HTTPException(404, "ACS device not found")

    values = _validated_device_values(data, partial=True)
    ip = values.get("ip_address", device.ip_address)
    sdk_port = values.get("sdk_port", device.sdk_port or 8000)
    username = (data.get("username") or device.username or "admin").strip()
    password = data.get("password") or (
        decrypt_camera_password(device.password or "") if device.password else ""
    )
    if not password:
        raise HTTPException(400, "No saved password is available for this device")

    _, _, probe_sdk = _try_load_sdk()
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _acs_executor,
        probe_sdk,
        ip,
        sdk_port,
        username,
        password,
    )
    if not result.get("ok"):
        raise HTTPException(400, result.get("message") or "HCNetSDK connection failed")
    return result


@router.get("/{device_id}")
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    device = db.get(AccessControlDevice, device_id)
    if not device:
        raise HTTPException(404, "ACS device not found")
    return _serialize(device)


@router.patch("/{device_id}")
def update_device(
    request: Request,
    device_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    device = db.get(AccessControlDevice, device_id)
    if not device:
        raise HTTPException(404, "ACS device not found")

    values = _validated_device_values(data, partial=True)
    if "ip_address" in values:
        _ensure_unique_device(db, values["ip_address"], exclude_device_id=device_id)
    for field in ("name", "ip_address", "sdk_port", "http_port", "door_count", "control_mode"):
        if field in values:
            setattr(device, field, values[field])
    if "username" in data:
        device.username = (data["username"] or "admin").strip()
    if "password" in data and data["password"]:
        device.password = encrypt_camera_password(data["password"])
    if "location" in data:
        device.location = (data["location"] or "").strip() or None
    if "notes" in data:
        device.notes = data["notes"] or None
    if "is_active" in data:
        device.is_active = 1 if data["is_active"] else 0

    device.updated_at = utc_now()
    db.commit()
    db.refresh(device)

    add_audit_log(db, current_user, "ACS_DEVICE_UPDATED", "acs_device", device.id,
                  f"Updated ACS device: {device.name} ({device.ip_address})",
                  request.client.host if request.client else None)

    return _serialize(device)


@router.delete("/{device_id}")
def delete_device(
    request: Request,
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    device = db.get(AccessControlDevice, device_id)
    if not device:
        raise HTTPException(404, "ACS device not found")

    name = device.name
    ip   = device.ip_address
    db.delete(device)
    db.commit()

    add_audit_log(db, current_user, "ACS_DEVICE_DELETED", "acs_device", device_id,
                  f"Deleted ACS device: {name} ({ip})",
                  request.client.host if request.client else None)

    return {"ok": True}


# ---------------------------------------------------------------------------
# Device status (online check + door/sensor states)
# ---------------------------------------------------------------------------

@router.get("/monitoring/summary")
def monitoring_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    total_controllers = db.query(AccessControlDevice).count()
    active_controllers = db.query(AccessControlDevice).filter(
        AccessControlDevice.is_active == 1,
    ).count()
    granted_today = db.query(func.count(AcsAccessEvent.id)).filter(
        AcsAccessEvent.created_at >= today,
        AcsAccessEvent.event_type == "access_granted",
    ).scalar() or 0
    denied_today = db.query(func.count(AcsAccessEvent.id)).filter(
        AcsAccessEvent.created_at >= today,
        AcsAccessEvent.event_type.in_(["access_denied", "alarm"]),
    ).scalar() or 0
    unknown_today = db.query(func.count(AcsAccessEvent.id)).filter(
        AcsAccessEvent.created_at >= today,
        AcsAccessEvent.person_id.is_(None),
        AcsAccessEvent.verify_mode.isnot(None),
        AcsAccessEvent.verify_mode != "manual",
    ).scalar() or 0
    return {
        "total_controllers": total_controllers,
        "active_controllers": active_controllers,
        "granted_today": int(granted_today),
        "denied_today": int(denied_today),
        "unknown_today": int(unknown_today),
    }


@router.get("/monitoring/command-history")
def monitoring_command_history(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.action.in_(["ACS_DOOR_CONTROL", "ACS_EMERGENCY_OPEN_ALL", "ACS_EMERGENCY_LOCKDOWN"]))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": row.id,
            "username": row.username or "System",
            "action": row.action,
            "details": row.details,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.get("/{device_id}/status")
async def device_status(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    device = db.get(AccessControlDevice, device_id)
    if not device:
        raise HTTPException(404, "ACS device not found")
    if not device.is_active:
        return {"device_id": device_id, "online": False, "message": "Device disabled"}

    _, acs_get_status, _ = _try_load_sdk()
    password = decrypt_camera_password(device.password or "") if device.password else ""

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _acs_executor,
        acs_get_status,
        device.ip_address,
        device.sdk_port or 8000,
        device.username or "admin",
        password,
    )
    return {"device_id": device_id, "device_name": device.name, **result}


@router.get("/{device_id}/face-capture")
@router.get("/{device_id}/snapshot", include_in_schema=False)
async def device_face_capture(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    device = db.get(AccessControlDevice, device_id)
    if not device:
        raise HTTPException(404, "ACS device not found")
    if not device.is_active:
        raise HTTPException(403, "Device is disabled")

    from app.hiksdk_client import acs_capture_face_sdk_sync

    password = decrypt_camera_password(device.password or "") if device.password else ""
    loop = asyncio.get_running_loop()
    try:
        image = await loop.run_in_executor(
            _acs_executor,
            acs_capture_face_sdk_sync,
            device.ip_address,
            device.sdk_port or 8000,
            device.username or "admin",
            password,
        )
    except Exception as exc:
        logger.warning("Face collection failed for ACS device %s: %s", device_id, exc)
        raise HTTPException(503, f"Device face collection failed: {exc}")
    return Response(content=image, media_type="image/jpeg")


# ---------------------------------------------------------------------------
# Door control — unlock / lock / stay_open / stay_close
# ---------------------------------------------------------------------------

@router.post("/{device_id}/doors/{door_no}/{command}")
async def door_control(
    request: Request,
    device_id: int,
    door_no: int,
    command: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    if command not in DOOR_COMMANDS:
        raise HTTPException(400, f"command must be one of: {', '.join(sorted(DOOR_COMMANDS))}")

    device = db.get(AccessControlDevice, device_id)
    if not device:
        raise HTTPException(404, "ACS device not found")
    if not device.is_active:
        raise HTTPException(403, "Device is disabled")
    if door_no < 1 or door_no > (device.door_count or 1):
        raise HTTPException(400, f"door_no must be 1–{device.door_count or 1}")

    password = decrypt_camera_password(device.password or "") if device.password else ""
    loop = asyncio.get_running_loop()
    mode = (device.control_mode or "isapi").lower()

    if mode == "sdk":
        acs_door_control, _, _ = _try_load_sdk()
        from app.hiksdk_client import ACS_DOOR_CMD_OPEN, ACS_DOOR_CMD_CLOSE, ACS_DOOR_CMD_STAY_OPEN, ACS_DOOR_CMD_STAY_CLOSE
        cmd_code_map = {"unlock": ACS_DOOR_CMD_OPEN, "lock": ACS_DOOR_CMD_CLOSE,
                        "stay_open": ACS_DOOR_CMD_STAY_OPEN, "stay_close": ACS_DOOR_CMD_STAY_CLOSE}
        result = await loop.run_in_executor(
            _acs_executor, acs_door_control,
            device.ip_address, device.sdk_port or 8000,
            device.username or "admin", password,
            door_no, cmd_code_map[command],
        )
    else:
        # ISAPI mode — works on all Hikvision ACS models
        acs_isapi = _try_load_isapi()
        result = await loop.run_in_executor(
            _acs_executor, acs_isapi,
            device.ip_address, device.http_port or 80,
            device.username or "admin", password,
            door_no, command,
        )

    # Log the manual control action
    ev = AcsAccessEvent(
        device_id   = device_id,
        door_no     = door_no,
        card_number = None,
        person_id   = None,
        event_type  = "manual_unlock" if command == "unlock" else f"manual_{command}",
        verify_mode = "manual",
        error_code  = result.get("error_code"),
        created_at  = utc_now(),
    )
    db.add(ev)
    db.flush()
    anti_passback = {"allowed": True}
    try:
        from app.routers.acs_anti_passback import process_access_event
        anti_passback = process_access_event(db, ev)
    except Exception:
        logger.exception("Anti-passback processing failed for ingested event")
    db.commit()
    db.refresh(ev)

    add_audit_log(db, current_user, "ACS_DOOR_CONTROL", "acs_device", device_id,
                  f"Door {door_no} command={command} on {device.name} ({device.ip_address}) "
                  f"— ok={result.get('ok')}",
                  request.client.host if request.client else None)

    if not result.get("ok"):
        raise HTTPException(502, f"Door command failed: {result.get('message')}")

    try:
        from app.ws_manager import manager as ws_manager
        row = _serialize_event(ev)
        row.update({
            "type": "acs_event",
            "device_name": device.name,
            "device_ip": device.ip_address,
            "operator": current_user.username,
        })
        await ws_manager.broadcast(row)
    except Exception:
        pass

    return {
        "ok":       True,
        "device_id": device_id,
        "door_no":   door_no,
        "command":   command,
        "message":   result.get("message", "ok"),
    }


# ---------------------------------------------------------------------------
# Access event log
# ---------------------------------------------------------------------------

@router.get("/{device_id}/events")
def list_device_events(
    device_id: int,
    limit: int = Query(100, ge=1, le=500),
    door_no: Optional[int] = Query(None),
    event_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    device = db.get(AccessControlDevice, device_id)
    if not device:
        raise HTTPException(404, "ACS device not found")

    from sqlalchemy.orm import joinedload
    q = (
        db.query(AcsAccessEvent)
        .options(joinedload(AcsAccessEvent.person))
        .filter(AcsAccessEvent.device_id == device_id)
    )
    if door_no is not None:
        q = q.filter(AcsAccessEvent.door_no == door_no)
    if event_type:
        q = q.filter(AcsAccessEvent.event_type == event_type)

    events = q.order_by(AcsAccessEvent.created_at.desc()).limit(limit).all()
    return _serialize_events_with_images(db, events)


@router.get("/events/all")
def list_all_acs_events(
    limit: int = Query(100, ge=1, le=500),
    event_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import joinedload
    q = (
        db.query(AcsAccessEvent)
        .options(joinedload(AcsAccessEvent.person),
                 joinedload(AcsAccessEvent.device))
        .order_by(AcsAccessEvent.created_at.desc())
    )
    if event_type:
        q = q.filter(AcsAccessEvent.event_type == event_type)
    events = q.limit(limit).all()
    result = []
    for row, e in zip(_serialize_events_with_images(db, events), events):
        row["device_name"] = e.device.name if e.device else None
        row["device_ip"]   = e.device.ip_address if e.device else None
        result.append(row)
    return result


@router.get("/events/search")
def search_acs_events(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    device_id: Optional[int] = Query(None),
    door_no: Optional[int] = Query(None),
    event_type: Optional[str] = Query(None),
    verify_mode: Optional[str] = Query(None),
    query: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    page = normalize_pagination(limit, offset, max_limit=200)
    events_query = (
        db.query(AcsAccessEvent)
        .outerjoin(Person, AcsAccessEvent.person_id == Person.id)
        .options(
            joinedload(AcsAccessEvent.person),
            joinedload(AcsAccessEvent.device),
        )
    )
    if device_id is not None:
        events_query = events_query.filter(AcsAccessEvent.device_id == device_id)
    if door_no is not None:
        events_query = events_query.filter(AcsAccessEvent.door_no == door_no)
    if event_type:
        events_query = events_query.filter(AcsAccessEvent.event_type == event_type)
    if verify_mode:
        events_query = events_query.filter(AcsAccessEvent.verify_mode == verify_mode)
    if date_from:
        events_query = events_query.filter(AcsAccessEvent.created_at >= date_from)
    if date_to:
        events_query = events_query.filter(AcsAccessEvent.created_at <= date_to)
    if query and query.strip():
        term = f"%{query.strip()}%"
        events_query = events_query.filter(or_(
            Person.full_name.ilike(term),
            Person.employee_no.ilike(term),
            AcsAccessEvent.card_number.ilike(term),
            AcsAccessEvent.denial_reason.ilike(term),
        ))

    total = events_query.count()
    events = (
        events_query
        .order_by(AcsAccessEvent.created_at.desc(), AcsAccessEvent.id.desc())
        .offset(page.offset)
        .limit(page.limit)
        .all()
    )
    rows = []
    for row, event in zip(_serialize_events_with_images(db, events), events):
        row["device_name"] = event.device.name if event.device else None
        row["device_ip"] = event.device.ip_address if event.device else None
        row["employee_no"] = event.person.employee_no if event.person else None
        rows.append(row)
    return {
        "total": total,
        "limit": page.limit,
        "offset": page.offset,
        "has_more": page.offset + len(rows) < total,
        "events": rows,
    }


# ---------------------------------------------------------------------------
# Emergency controls — lockdown all / open all
# ---------------------------------------------------------------------------

@router.post("/emergency/{command}")
async def emergency_control(
    request: Request,
    command: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Send a command to ALL active ACS devices and ALL their doors.
    command: lockdown (lock all) | open_all (unlock all)
    """
    if command not in {"lockdown", "open_all"}:
        raise HTTPException(400, "command must be: lockdown | open_all")

    door_cmd = "lock" if command == "lockdown" else "unlock"
    devices  = db.query(AccessControlDevice).filter(AccessControlDevice.is_active == 1).all()

    if not devices:
        raise HTTPException(404, "No active ACS devices found")

    loop    = asyncio.get_running_loop()
    results = []

    for device in devices:
        password = decrypt_camera_password(device.password or "") if device.password else ""
        mode     = (device.control_mode or "isapi").lower()
        device_results = []

        for door_no in range(1, (device.door_count or 1) + 1):
            if mode == "sdk":
                acs_door_control, _, _ = _try_load_sdk()
                from app.hiksdk_client import ACS_DOOR_CMD_OPEN, ACS_DOOR_CMD_CLOSE
                cmd_code = ACS_DOOR_CMD_OPEN if door_cmd == "unlock" else ACS_DOOR_CMD_CLOSE
                res = await loop.run_in_executor(
                    _acs_executor, acs_door_control,
                    device.ip_address, device.sdk_port or 8000,
                    device.username or "admin", password, door_no, cmd_code,
                )
            else:
                acs_isapi = _try_load_isapi()
                res = await loop.run_in_executor(
                    _acs_executor, acs_isapi,
                    device.ip_address, device.http_port or 80,
                    device.username or "admin", password, door_no, door_cmd,
                )

            ev = AcsAccessEvent(
                device_id  = device.id,
                door_no    = door_no,
                event_type = f"emergency_{command}",
                verify_mode= "emergency",
                error_code = None if res.get("ok") else res.get("error_code"),
                created_at = utc_now(),
            )
            db.add(ev)
            device_results.append({"door_no": door_no, "ok": res.get("ok"), "msg": res.get("message")})

        db.commit()
        results.append({"device_id": device.id, "device_name": device.name, "doors": device_results})

    add_audit_log(
        db, current_user, f"ACS_EMERGENCY_{command.upper()}", "acs_all", None,
        f"Emergency {command} sent to {len(devices)} device(s)",
        request.client.host if request.client else None,
    )

    # Broadcast emergency via WebSocket
    try:
        from app.ws_manager import manager as ws_manager

        asyncio.create_task(ws_manager.broadcast({
            "type": "acs_emergency",
            "command": command,
            "affected_devices": len(devices),
            "triggered_by": current_user.username,
        }))
    except Exception:
        pass

    return {"ok": True, "command": command, "devices": results}


# ---------------------------------------------------------------------------
# ACS Live events endpoint (SSE-style polling + WebSocket)
# ---------------------------------------------------------------------------

@router.get("/events/live")
def live_events_poll(
    since_id: int = Query(0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return events newer than since_id for frontend live polling."""
    from sqlalchemy.orm import joinedload
    q = (
        db.query(AcsAccessEvent)
        .options(joinedload(AcsAccessEvent.person), joinedload(AcsAccessEvent.device))
        .filter(AcsAccessEvent.id > since_id)
        .order_by(AcsAccessEvent.id.desc())
        .limit(limit)
    )
    events = q.all()
    result = []
    for row, e in zip(_serialize_events_with_images(db, events), events):
        row["device_name"] = e.device.name if e.device else None
        row["device_ip"]   = e.device.ip_address if e.device else None
        result.append(row)
    return {"events": result, "latest_id": events[0].id if events else since_id}


@router.post("/events/ingest")
async def ingest_acs_event(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """Manually push an ACS event (e.g. from device webhook callback)."""
    device_id = data.get("device_id")
    if not device_id:
        raise HTTPException(400, "device_id required")
    device = db.get(AccessControlDevice, device_id)
    if not device:
        raise HTTPException(404, "ACS device not found")

    card_number = data.get("card_number")
    if card_number and len(str(card_number)) > 64:
        raise HTTPException(400, "card_number must not exceed 64 characters")
    denial_reason = data.get("denial_reason")
    if denial_reason and len(str(denial_reason)) > 255:
        raise HTTPException(400, "denial_reason must not exceed 255 characters")
    direction = data.get("direction")
    if direction and direction not in {"in", "out"}:
        raise HTTPException(400, "direction must be 'in' or 'out'")

    ev = AcsAccessEvent(
        device_id    = device_id,
        door_no      = data.get("door_no", 1),
        card_number  = card_number,
        person_id    = data.get("person_id"),
        event_type   = data.get("event_type", "access_granted"),
        verify_mode  = data.get("verify_mode", "card"),
        denial_reason= denial_reason,
        direction    = direction,
        created_at   = utc_now(),
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    # Broadcast via WebSocket
    try:
        from app.ws_manager import manager as ws_manager
        row = _serialize_event(ev)
        row["type"] = "acs_event"
        row["device_name"] = device.name
        await ws_manager.broadcast(row)
    except Exception:
        pass

    # Update attendance records
    try:
        from app.acs_attendance import process_acs_event
        process_acs_event(db, ev)
    except Exception:
        pass

    result = _serialize_event(ev)
    result["anti_passback"] = anti_passback
    return result
