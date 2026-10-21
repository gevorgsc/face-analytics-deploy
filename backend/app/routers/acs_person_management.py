"""ACS person management with hierarchical departments and HCNetSDK provisioning."""

import asyncio
import base64
import json
import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import cv2
import numpy as np
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_operator_or_admin
from app.db import get_db
from app.models import (
    AccessControlDevice,
    AccessLevel,
    AccessLevelMember,
    CardIssue,
    Department,
    Person,
    User,
)
from app.secrets import decrypt_camera_password
from app.utils import add_audit_log, full_media_path, save_bytes_to_media, sign_media_fields, utc_now
from app.ws_manager import manager as ws_manager
from app.acs_person_service import (
    _person_card_numbers,
    _person_fingerprints,
    synchronize_person_background,
)


router = APIRouter(prefix="/api/acs/person-management", tags=["acs_person_management"])
_executor = ThreadPoolExecutor(max_workers=4)
logger = logging.getLogger(__name__)

def _dt(value):
    if not value:
        return None
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _department_row(department: Department) -> dict:
    return {
        "id": department.id,
        "name": department.name,
        "parent_id": department.parent_id,
        "code": department.code,
        "description": department.description,
        "sort_order": department.sort_order or 0,
    }


def _person_row(
    person: Person,
    db: Session,
    *,
    _levels: list | None = None,
    _cards: list | None = None,
) -> dict:
    levels = _levels if _levels is not None else (
        db.query(AccessLevelMember)
        .options(joinedload(AccessLevelMember.level))
        .filter(AccessLevelMember.person_id == person.id)
        .all()
    )
    cards = _cards if _cards is not None else (
        db.query(CardIssue)
        .options(joinedload(CardIssue.device))
        .filter(CardIssue.person_id == person.id, CardIssue.status == "active")
        .all()
    )
    card_numbers = _person_card_numbers(person)
    for card in cards:
        if card.card_number and not card.card_number.startswith("employee:"):
            card_numbers.append(card.card_number)
    card_numbers = list(dict.fromkeys(card_numbers))[:5]
    device_rows = {}
    for card in cards:
        device_rows[card.device_id] = {
            "id": card.device_id,
            "name": card.device.name if card.device else None,
        }
    return sign_media_fields({
        "id": person.id,
        "employee_no": person.employee_no,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "full_name": person.full_name,
        "department_id": person.department_id,
        "department": person.department_ref.name if person.department_ref else person.department,
        "gender": person.gender,
        "position": person.position,
        "email": person.email,
        "phone": person.phone,
        "notes": person.notes,
        "preview_image": person.preview_image,
        "valid_from": person.valid_from,
        "valid_to": person.valid_to,
        "employment_date": person.employment_date,
        "card_number": card_numbers[0] if card_numbers else None,
        "card_numbers": card_numbers,
        "fingerprints": (_fps := _person_fingerprints(person)),
        "fingerprint_count": len(_fps),
        "pin_code": person.pin_code,
        "max_access_times": person.max_access_times,
        "access_times_used": int(person.access_times_used or 0),
        "access_times_remaining": (
            max(0, int(person.max_access_times) - int(person.access_times_used or 0))
            if person.max_access_times else None
        ),
        "acs_active": bool(person.acs_active),
        "acs_deactivated_at": person.acs_deactivated_at,
        "acs_sync_status": person.acs_sync_status or "local",
        "acs_sync_error": person.acs_sync_error,
        "access_levels": [
            {"id": member.access_level_id, "name": member.level.name if member.level else None}
            for member in levels
        ],
        "devices": list(device_rows.values()),
    })


def _descendant_ids(departments: list[Department], root_id: int) -> set[int]:
    result = {root_id}
    changed = True
    while changed:
        changed = False
        for department in departments:
            if department.parent_id in result and department.id not in result:
                result.add(department.id)
                changed = True
    return result


def _capture_usb_frame(device_index: int) -> bytes:
    camera = cv2.VideoCapture(device_index, cv2.CAP_DSHOW)
    if not camera.isOpened():
        camera.release()
        camera = cv2.VideoCapture(device_index)
    if not camera.isOpened():
        raise RuntimeError(f"USB camera {device_index} is not available")
    try:
        frame = None
        for _ in range(8):
            ok, candidate = camera.read()
            if ok and candidate is not None:
                frame = candidate
        if frame is None:
            raise RuntimeError("USB camera did not return an image")
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not ok:
            raise RuntimeError("Unable to encode USB camera image")
        return encoded.tobytes()
    finally:
        camera.release()


@router.get("/departments")
def list_departments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(Department).order_by(Department.sort_order, Department.name).all()
    return [_department_row(row) for row in rows]


@router.get("/capture-usb")
async def capture_usb_camera(
    device_index: int = Query(0, ge=0, le=10),
    current_user: User = Depends(require_operator_or_admin),
):
    loop = asyncio.get_running_loop()
    try:
        image = await loop.run_in_executor(_executor, _capture_usb_frame, device_index)
    except Exception as exc:
        raise HTTPException(503, str(exc))
    return Response(content=image, media_type="image/jpeg")


_card_enrollments: dict[str, dict] = {}
_card_enrollments_lock = threading.Lock()
_CARD_ENROLLMENT_TTL = 60


def _card_event_key(event: dict) -> tuple:
    serial_no = event.get("serial_no")
    if serial_no not in (None, ""):
        return ("serial", str(serial_no))
    return (
        "event",
        str(event.get("time") or ""),
        str(event.get("card_number") or ""),
        str(event.get("employee_no") or ""),
        str(event.get("door_no") or ""),
        str(event.get("minor_type") or ""),
    )


def _purge_card_enrollments() -> None:
    now = time.monotonic()
    with _card_enrollments_lock:
        expired = [
            session_id
            for session_id, session in _card_enrollments.items()
            if now >= float(session.get("expires_at") or 0)
        ]
        for session_id in expired:
            _card_enrollments.pop(session_id, None)


@router.post("/fingerprint-capture")
async def capture_fingerprint(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    data = await request.json()
    device = db.get(AccessControlDevice, int(data.get("device_id") or 0))
    finger_no = int(data.get("finger_no") or 1)
    if not device or not device.is_active:
        raise HTTPException(404, "Active access terminal not found")
    if not 1 <= finger_no <= 10:
        raise HTTPException(400, "Fingerprint number must be between 1 and 10")

    from app.hiksdk_client import acs_capture_fingerprint_sdk_sync

    password = decrypt_camera_password(device.password or "")
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            _executor,
            lambda: acs_capture_fingerprint_sdk_sync(
                device.ip_address,
                device.sdk_port or 8000,
                device.username or "admin",
                password,
                finger_no=finger_no,
            ),
        )
    except Exception as exc:
        raise HTTPException(502, str(exc))
    return {
        "ok": True,
        "finger_no": result["finger_no"],
        "quality": result["quality"],
        "template": base64.b64encode(result["template"]).decode("ascii"),
    }


@router.post("/card-enrollment/start")
async def start_card_enrollment(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    data = await request.json()
    device_id = int(data.get("device_id") or 0)
    device = db.get(AccessControlDevice, device_id)
    if not device or not device.is_active:
        raise HTTPException(404, "Active access terminal not found")

    from app.isapi_acs import acs_events_query_isapi

    password = decrypt_camera_password(device.password or "")
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _executor,
        lambda: acs_events_query_isapi(
            device.ip_address,
            device.http_port or 80,
            device.username or "admin",
            password,
            major=5,
            max_results=100,
        ),
    )
    if not result.get("ok"):
        raise HTTPException(
            502,
            f"Unable to start card enrollment on {device.name}: {result.get('message') or 'event query failed'}",
        )

    _purge_card_enrollments()
    session_id = uuid.uuid4().hex
    with _card_enrollments_lock:
        _card_enrollments[session_id] = {
            "device_id": device.id,
            "user_id": current_user.id,
            "expires_at": time.monotonic() + _CARD_ENROLLMENT_TTL,
            "seen": {_card_event_key(event) for event in result.get("events", [])},
        }
    logger.info(
        "Card enrollment started: session=%s device=%s user=%s",
        session_id,
        device.id,
        current_user.id,
    )
    return {
        "session_id": session_id,
        "device_id": device.id,
        "device_name": device.name,
        "expires_in": _CARD_ENROLLMENT_TTL,
        "status": "collecting",
    }


@router.get("/card-enrollment/{session_id}")
async def poll_card_enrollment(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    with _card_enrollments_lock:
        session = _card_enrollments.get(session_id)
        if not session or session["user_id"] != current_user.id:
            raise HTTPException(404, "Card enrollment session not found")
        if time.monotonic() >= session["expires_at"]:
            _card_enrollments.pop(session_id, None)
            return {"status": "expired"}

    device = db.get(AccessControlDevice, session["device_id"])
    if not device or not device.is_active:
        with _card_enrollments_lock:
            _card_enrollments.pop(session_id, None)
        raise HTTPException(404, "Access terminal is no longer available")

    from app.isapi_acs import acs_events_query_isapi

    password = decrypt_camera_password(device.password or "")
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _executor,
        lambda: acs_events_query_isapi(
            device.ip_address,
            device.http_port or 80,
            device.username or "admin",
            password,
            major=5,
            max_results=100,
        ),
    )
    if not result.get("ok"):
        raise HTTPException(
            502,
            f"Unable to read card from {device.name}: {result.get('message') or 'event query failed'}",
        )

    current_events = result.get("events", [])
    unseen = [
        event
        for event in current_events
        if _card_event_key(event) not in session["seen"]
    ]
    session["seen"].update(_card_event_key(event) for event in current_events)

    card_event = next(
        (event for event in unseen if str(event.get("card_number") or "").strip()),
        None,
    )
    if card_event:
        card_number = str(card_event["card_number"]).strip()
        with _card_enrollments_lock:
            _card_enrollments.pop(session_id, None)
        logger.info(
            "Card enrollment captured: session=%s device=%s card=%s",
            session_id,
            device.id,
            card_number,
        )
        return {
            "status": "captured",
            "card_number": card_number,
            "device_id": device.id,
            "device_name": device.name,
        }

    return {
        "status": "collecting",
        "expires_in": max(0, int(session["expires_at"] - time.monotonic())),
    }


@router.delete("/card-enrollment/{session_id}")
async def cancel_card_enrollment(
    session_id: str,
    current_user: User = Depends(require_operator_or_admin),
):
    with _card_enrollments_lock:
        session = _card_enrollments.get(session_id)
        if session and session["user_id"] == current_user.id:
            _card_enrollments.pop(session_id, None)
    return {"ok": True}


@router.post("/departments")
async def create_department(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Department name is required")
    parent_id = data.get("parent_id")
    if parent_id and not db.get(Department, parent_id):
        raise HTTPException(404, "Parent department not found")
    department = Department(
        name=name,
        parent_id=parent_id or None,
        code=(data.get("code") or "").strip() or None,
        description=(data.get("description") or "").strip() or None,
        sort_order=int(data.get("sort_order") or 0),
    )
    db.add(department)
    db.commit()
    db.refresh(department)
    add_audit_log(db, current_user, "ACS_DEPARTMENT_CREATED", "department", department.id, name,
                  request.client.host if request.client else None)
    await ws_manager.broadcast({"type": "acs_department_updated", "action": "created", "department_id": department.id})
    return _department_row(department)


def _department_creates_cycle(db: Session, dept_id: int, new_parent_id: int) -> bool:
    """Return True if setting new_parent_id as the parent of dept_id would create a cycle."""
    visited = set()
    current = new_parent_id
    while current is not None:
        if current == dept_id:
            return True
        if current in visited:
            break
        visited.add(current)
        row = db.query(Department).filter(Department.id == current).first()
        current = row.parent_id if row else None
    return False


@router.patch("/departments/{department_id}")
async def update_department(
    department_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(404, "Department not found")
    new_parent_id = data.get("parent_id") or None
    if new_parent_id == department_id:
        raise HTTPException(400, "A department cannot be its own parent")
    if new_parent_id and _department_creates_cycle(db, department_id, new_parent_id):
        raise HTTPException(400, "Setting this parent would create a circular department hierarchy")
    for field in ("name", "code", "description"):
        if field in data:
            setattr(department, field, (data.get(field) or "").strip() or None)
    if "parent_id" in data:
        department.parent_id = new_parent_id
    if "sort_order" in data:
        department.sort_order = int(data.get("sort_order") or 0)
    db.commit()
    db.refresh(department)
    await ws_manager.broadcast({"type": "acs_department_updated", "action": "renamed", "department_id": department.id})
    return _department_row(department)


@router.delete("/departments/{department_id}")
async def delete_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(404, "Department not found")
    if db.query(Person).filter(Person.department_id == department_id).first():
        raise HTTPException(409, "Move department members before deleting this department")
    db.delete(department)
    db.commit()
    await ws_manager.broadcast({"type": "acs_department_updated", "action": "deleted", "department_id": department_id})
    return {"ok": True}


@router.get("/persons")
def list_persons(
    department_id: int | None = Query(None),
    include_subdepartments: bool = Query(True),
    search: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Person).options(joinedload(Person.department_ref)).filter(
        Person.source == "acs",
    )
    if department_id:
        ids = {department_id}
        if include_subdepartments:
            ids = _descendant_ids(db.query(Department).all(), department_id)
        query = query.filter(Person.department_id.in_(ids))
    elif not include_subdepartments:
        query = query.filter(Person.department_id.is_(None))
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            Person.full_name.ilike(term),
            Person.employee_no.ilike(term),
            Person.card_number.ilike(term),
            Person.card_numbers.ilike(term),
            Person.email.ilike(term),
        ))
    persons = query.order_by(Person.first_name, Person.last_name, Person.full_name).all()

    # Batch-load related data to avoid N+1 queries
    person_ids = [p.id for p in persons]
    if person_ids:
        all_levels = (
            db.query(AccessLevelMember)
            .options(joinedload(AccessLevelMember.level))
            .filter(AccessLevelMember.person_id.in_(person_ids))
            .all()
        )
        all_cards = (
            db.query(CardIssue)
            .options(joinedload(CardIssue.device))
            .filter(CardIssue.person_id.in_(person_ids), CardIssue.status == "active")
            .all()
        )
        levels_by_person: dict[int, list] = {}
        for m in all_levels:
            levels_by_person.setdefault(m.person_id, []).append(m)
        cards_by_person: dict[int, list] = {}
        for c in all_cards:
            cards_by_person.setdefault(c.person_id, []).append(c)
    else:
        levels_by_person, cards_by_person = {}, {}

    return [
        _person_row(
            person, db,
            _levels=levels_by_person.get(person.id, []),
            _cards=cards_by_person.get(person.id, []),
        )
        for person in persons
    ]


async def _request_payload(request: Request) -> tuple[dict, bytes | None]:
    content_type = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" not in content_type:
        return await request.json(), None
    form = await request.form()
    payload = json.loads(form.get("payload") or "{}")
    photo = form.get("photo")
    photo_bytes = await photo.read() if photo and getattr(photo, "filename", None) else None
    if photo_bytes:
        decoded = cv2.imdecode(np.frombuffer(photo_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if decoded is None:
            raise HTTPException(400, "The selected face picture is not a valid image")
        encoded_ok, encoded = cv2.imencode(".jpg", decoded, [cv2.IMWRITE_JPEG_QUALITY, 95])
        if not encoded_ok:
            raise HTTPException(400, "Unable to process the selected face picture")
        photo_bytes = encoded.tobytes()
    return payload, photo_bytes


async def _save_person(
    request: Request,
    person: Person | None,
    db: Session,
    current_user: User,
    background_tasks: BackgroundTasks,
):
    data, photo_bytes = await _request_payload(request)
    previous_fingerprints = _person_fingerprints(person) if person else []
    previous_pin_code = person.pin_code or "" if person else ""
    employee_no = (data.get("employee_no") or "").strip()
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    if not employee_no or not first_name:
        raise HTTPException(400, "Employee ID and first name are required")
    access_level_ids = {int(value) for value in data.get("access_level_ids", [])}
    door_numbers_by_device: dict[int, set[int]] = {}
    if access_level_ids:
        selected_levels = db.query(AccessLevel).filter(
            AccessLevel.id.in_(access_level_ids),
            AccessLevel.is_active == 1,
        ).all()
        for level in selected_levels:
            for rule in json.loads(level.door_rules or "[]"):
                device_id = int(rule.get("device_id") or 0)
                if not device_id:
                    continue
                doors = {
                    int(value)
                    for value in (rule.get("door_numbers") or [1])
                    if int(value) > 0
                }
                door_numbers_by_device.setdefault(device_id, set()).update(doors or {1})
    device_ids = sorted(door_numbers_by_device)
    normalized_doors = {
        device_id: sorted(doors)
        for device_id, doors in door_numbers_by_device.items()
    }
    raw_card_numbers = data.get("card_numbers")
    if raw_card_numbers is None:
        raw_card_numbers = [data.get("card_number")] if data.get("card_number") else []
    card_numbers = list(dict.fromkeys(
        str(value).strip()
        for value in raw_card_numbers
        if str(value or "").strip()
    ))
    if len(card_numbers) > 5:
        raise HTTPException(400, "A person can have up to 5 cards")
    if card_numbers:
        card_conflict = db.query(CardIssue).filter(
            CardIssue.card_number.in_(card_numbers),
            CardIssue.status == "active",
        )
        if person:
            card_conflict = card_conflict.filter(CardIssue.person_id != person.id)
        conflict = card_conflict.first()
        if conflict:
            raise HTTPException(409, f"Card {conflict.card_number} is already assigned to another person")
    fingerprints = data.get("fingerprints") or []
    normalized_fingerprints = []
    seen_finger_numbers = set()
    for value in fingerprints:
        finger_no = int(value.get("finger_no") or 0)
        template = str(value.get("template") or "").strip()
        if not 1 <= finger_no <= 10 or not template:
            raise HTTPException(400, "Invalid fingerprint template")
        if finger_no in seen_finger_numbers:
            raise HTTPException(400, f"Fingerprint number {finger_no} is duplicated")
        try:
            decoded_template = base64.b64decode(template, validate=True)
        except Exception:
            raise HTTPException(400, f"Fingerprint number {finger_no} has invalid template data")
        if not 1 <= len(decoded_template) <= 768:
            raise HTTPException(400, f"Fingerprint number {finger_no} has invalid template length")
        seen_finger_numbers.add(finger_no)
        normalized_fingerprints.append({
            "finger_no": finger_no,
            "quality": int(value.get("quality") or 0),
            "template": template,
        })
    if len(normalized_fingerprints) > 10:
        raise HTTPException(400, "A person can have up to 10 fingerprints")
    pin_code = str(data.get("pin_code") or "").strip()
    if pin_code and (not pin_code.isdigit() or not 4 <= len(pin_code) <= 8):
        raise HTTPException(400, "PIN code must contain 4 to 8 digits")
    valid_from = _dt(data.get("valid_from"))
    valid_to = _dt(data.get("valid_to"))
    if not valid_from or not valid_to:
        raise HTTPException(400, "Effective Period start and end are required")
    if valid_to <= valid_from:
        raise HTTPException(400, "Effective Period end must be later than its start")
    duplicate = db.query(Person).filter(Person.employee_no == employee_no)
    if person:
        duplicate = duplicate.filter(Person.id != person.id)
    if duplicate.first():
        raise HTTPException(409, "Employee ID already exists")

    if person is None:
        person = Person(person_type="employee", source="acs", first_seen=utc_now(), last_seen=utc_now())
        db.add(person)

    department = db.get(Department, data.get("department_id")) if data.get("department_id") else None
    person.employee_no = employee_no
    person.first_name = first_name
    person.last_name = last_name or None
    person.full_name = " ".join(part for part in (first_name, last_name) if part)
    person.department_id = department.id if department else None
    person.department = department.name if department else None
    person.gender = data.get("gender") or "unknown"
    person.position = (data.get("position") or "").strip() or None
    person.email = (data.get("email") or "").strip() or None
    person.phone = (data.get("phone") or "").strip() or None
    person.notes = (data.get("notes") or "").strip() or None
    person.card_number = card_numbers[0] if card_numbers else None
    person.card_numbers = json.dumps(card_numbers)
    person.fingerprints = json.dumps(normalized_fingerprints)
    person.pin_code = pin_code or None
    person.valid_from = valid_from
    person.valid_to = valid_to
    person.employment_date = _dt(data.get("employment_date"))
    person.max_access_times = int(data["max_access_times"]) if data.get("max_access_times") else None
    if person.max_access_times is not None and person.max_access_times < 1:
        raise HTTPException(400, "Limit Access Times must be at least 1")
    if not person.max_access_times:
        person.access_times_used = 0
    person.super_access = 0
    person.extended_access = 0
    person.device_administrator = 0
    
    # Set initial sync status to pending
    person.acs_sync_status = "pending"
    person.acs_sync_error = None

    if photo_bytes:
        try:
            person.preview_image = save_bytes_to_media(photo_bytes, "acs_person")
        except Exception as e:
            logger.error(f"Failed to save profile picture: {e}")
    db.commit()
    db.refresh(person)

    existing_members = db.query(AccessLevelMember).filter(AccessLevelMember.person_id == person.id).all()
    for member in existing_members:
        if member.access_level_id not in access_level_ids:
            db.delete(member)
    existing_ids = {member.access_level_id for member in existing_members}
    for level_id in access_level_ids - existing_ids:
        if db.get(AccessLevel, level_id):
            db.add(AccessLevelMember(
                access_level_id=level_id,
                person_id=person.id,
                valid_from=person.valid_from,
                valid_to=person.valid_to,
            ))
    db.commit()

    # Prepare photo for background task
    sync_photo_for_bg = photo_bytes
    if not sync_photo_for_bg and person.preview_image:
        try:
            with open(full_media_path(person.preview_image), "rb") as image_file:
                sync_photo_for_bg = image_file.read()
        except OSError:
            sync_photo_for_bg = None

    # Get previous device IDs for background task
    previous_device_ids: set[int] = set()
    if person is not None:
        previous_device_ids = {
            row.device_id
            for row in db.query(CardIssue).filter(
                CardIssue.person_id == person.id,
                CardIssue.status == "active",
            ).all()
        }
    
    credentials_changed = (
        previous_fingerprints != normalized_fingerprints
        or previous_pin_code != pin_code
    )

    person_row = _person_row(person, db)

    # Add hardware synchronization to background tasks
    background_tasks.add_task(
        synchronize_person_background,
        _executor,
        ws_manager,
        person.id, card_numbers, device_ids, normalized_doors, sync_photo_for_bg,
        previous_device_ids, credentials_changed,
    )

    add_audit_log(
        db, current_user, "ACS_PERSON_SAVED", "person", person.id,
        f"Saved {person.full_name}; SDK devices={len(device_ids)}",
        request.client.host if request.client else None,
    )
    return {"person": person_row, "sync_results": []}


@router.post("/persons")
async def create_person(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    result = await _save_person(request, None, db, current_user, background_tasks)
    await ws_manager.broadcast({
        "type": "acs_person_updated",
        "person_id": result["person"]["id"],
        "acs_sync_status": result["person"].get("acs_sync_status"),
    })
    return result


@router.patch("/persons/{person_id}")
async def update_person(
    person_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")
    result = await _save_person(request, person, db, current_user, background_tasks)
    await ws_manager.broadcast({
        "type": "acs_person_updated",
        "person_id": result["person"]["id"],
        "acs_sync_status": result["person"].get("acs_sync_status"),
    })
    return result


def _person_sync_context(db: Session, person: Person) -> tuple[list[int], dict[int, list[int]], bytes | None]:
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
                if not device_id:
                    continue
                doors = {
                    int(value)
                    for value in (rule.get("door_numbers") or [1])
                    if int(value) > 0
                }
                door_numbers_by_device.setdefault(device_id, set()).update(doors or {1})

    device_ids = sorted(door_numbers_by_device)
    normalized_doors = {
        device_id: sorted(doors)
        for device_id, doors in door_numbers_by_device.items()
    }
    sync_photo = None
    if person.preview_image:
        try:
            with open(full_media_path(person.preview_image), "rb") as image_file:
                sync_photo = image_file.read()
        except OSError:
            pass
    return device_ids, normalized_doors, sync_photo


def _queue_person_sync(
    person: Person,
    background_tasks: BackgroundTasks,
    device_ids: list[int],
    normalized_doors: dict[int, list[int]],
    sync_photo: bytes | None,
) -> None:
    background_tasks.add_task(
        synchronize_person_background,
        _executor,
        ws_manager,
        person.id,
        _person_card_numbers(person),
        device_ids,
        normalized_doors,
        sync_photo,
        set(),
        True,
    )


@router.post("/persons/{person_id}/resync")
async def resync_person(
    person_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")
    if not person.acs_active:
        raise HTTPException(409, "Passive person must be activated before synchronization")

    device_ids, normalized_doors, sync_photo = _person_sync_context(db, person)
    if not device_ids:
        raise HTTPException(409, "Assign an access level with at least one controller before synchronization")

    person.acs_sync_status = "pending"
    person.acs_sync_error = None
    db.commit()
    db.refresh(person)
    _queue_person_sync(person, background_tasks, device_ids, normalized_doors, sync_photo)

    row = _person_row(person, db)
    await ws_manager.broadcast({
        "type": "acs_person_updated",
        "person_id": person.id,
        "acs_sync_status": row.get("acs_sync_status"),
    })
    return {"person": row, "sync_results": []}


@router.post("/persons/{person_id}/activate")
async def activate_person(
    person_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    device_ids, normalized_doors, sync_photo = _person_sync_context(db, person)

    # Set initial sync status to pending
    person.access_times_used = 0
    person.acs_deactivated_at = None
    person.acs_sync_status = "pending"
    person.acs_sync_error = None
    person.acs_active = 1
    db.commit()
    db.refresh(person)

    _queue_person_sync(person, background_tasks, device_ids, normalized_doors, sync_photo)

    row = _person_row(person, db)
    await ws_manager.broadcast({
        "type": "acs_person_updated",
        "person_id": person.id,
        "acs_sync_status": row.get("acs_sync_status"),
    })
    return {"person": row, "sync_results": []}


@router.post("/persons/move")
async def move_persons(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    person_ids = [int(pid) for pid in (payload.get("person_ids") or []) if pid]
    if not person_ids:
        return {"moved": 0}

    department_id = payload.get("department_id") or None
    department = db.get(Department, int(department_id)) if department_id else None
    if department_id and not department:
        raise HTTPException(404, "Destination department not found")

    moved = db.query(Person).filter(
        Person.id.in_(person_ids),
        Person.source == "acs",
    ).update(
        {
            "department_id": department.id if department else None,
            "department": department.name if department else None,
        },
        synchronize_session=False,
    )
    db.commit()
    await ws_manager.broadcast({
        "type": "acs_person_updated",
        "action": "moved",
        "person_ids": person_ids,
        "department_id": department.id if department else None,
    })
    return {
        "moved": moved,
        "department_id": department.id if department else None,
        "department": department.name if department else None,
    }


@router.delete("/persons/{person_id}")
async def delete_person(
    person_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    employee_no = person.employee_no or str(person.id)

    from app.hiksdk_client import acs_person_delete_isapi_sync
    loop = asyncio.get_running_loop()

    # Collect target devices from CardIssue records first
    card_issues = (
        db.query(CardIssue)
        .options(joinedload(CardIssue.device))
        .filter(CardIssue.person_id == person_id)
        .all()
    )
    seen_device_ids: set[int] = set()
    for ci in card_issues:
        if ci.device:
            seen_device_ids.add(ci.device.id)

    # Legacy synced records may not have CardIssue rows. Try every active
    # controller for those records, but keep truly local people local-only.
    should_delete_from_devices = bool(seen_device_ids) or (
        (person.acs_sync_status or "local") != "local"
    )
    if not seen_device_ids and should_delete_from_devices:
        all_devices = (
            db.query(AccessControlDevice)
            .filter(AccessControlDevice.is_active == 1)
            .all()
        )
        target_devices = all_devices
        logger.info("ACS delete person %s (employee_no=%s): no CardIssue records, falling back to %d active device(s)",
                    person_id, employee_no, len(all_devices))
    elif not should_delete_from_devices:
        target_devices = []
        logger.info(
            "ACS delete person %s (employee_no=%s): local-only record, skipping controllers",
            person_id,
            employee_no,
        )
    else:
        target_devices = list({d.id: d for d in (ci.device for ci in card_issues if ci.device)}.values())
        logger.info("ACS delete person %s (employee_no=%s): found CardIssue records for %d device(s)",
                    person_id, employee_no, len(target_devices))

    delete_results = []
    attempted_ids: set[int] = set()
    for device in target_devices:
        if not device or device.id in attempted_ids:
            continue
        attempted_ids.add(device.id)
        password = decrypt_camera_password(device.password or "")
        try:
            result = await loop.run_in_executor(
                _executor,
                lambda d=device: acs_person_delete_isapi_sync(
                    d.ip_address, d.http_port or 80, d.username or "admin", password,
                    employee_no=employee_no,
                ),
            )
            logger.info("ACS delete person %s from device %s (%s): ok=%s status=%s sub=%s",
                        employee_no, device.name, device.ip_address,
                        result.get("ok"), result.get("status_code"), result.get("sub_status_code"))
            delete_results.append({"device_id": device.id, "device_name": device.name, **result})
        except Exception as exc:
            logger.error("ACS delete person %s from device %s failed: %s", employee_no, device.name, exc)
            delete_results.append({"device_id": device.id, "device_name": device.name, "ok": False, "message": str(exc)})

    failures = [item for item in delete_results if not item.get("ok")]
    if failures:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Person was not deleted locally because controller removal failed",
                "device_deletions": delete_results,
            },
        )

    db.delete(person)
    db.commit()
    await ws_manager.broadcast({"type": "acs_person_deleted", "person_id": person_id})
    return {"ok": True, "device_deletions": delete_results}
