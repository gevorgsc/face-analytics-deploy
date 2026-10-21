"""Poll ACS events and enforce per-person access limits."""

import logging
import os
import threading
import time
from datetime import datetime

from sqlalchemy import update as sa_update

from app.db import SessionLocal
from app.hiksdk_client import acs_person_delete_isapi_sync
from app.isapi_acs import acs_events_query_isapi
from app.models import AccessControlDevice, AcsAccessEvent, CardIssue, FaceEvent, Person
from app.secrets import decrypt_camera_password
from app.utils import (
    crop_face_preview,
    extract_faces,
    full_media_path,
    save_bytes_to_media,
    utc_now,
)

logger = logging.getLogger(__name__)
_started = False
_start_lock = threading.Lock()

# Hikvision MAJOR_EVENT (0x5) authentication-success minor codes.
# These cover card, PIN/password, fingerprint, face, and their combinations.
SUCCESSFUL_ACCESS_MINOR_TYPES = frozenset({
    0x01,  # Legal card
    0x02,  # Card + password
    0x10,  # Multi-factor verification
    0x22,  # Multi-factor super password
    0x26,  # Fingerprint
    0x28,  # Card + fingerprint
    0x2B,  # Card + fingerprint + password
    0x2E,  # Fingerprint + password
    0x36,  # Face + fingerprint
    0x39,  # Face + password
    0x3C,  # Face + card
    0x3F,  # Face + password + fingerprint
    0x42,  # Face + card + fingerprint
    0x45,  # Employee number + fingerprint
    0x48,  # Employee number + fingerprint + password
    0x4B,  # Face
    0x4D,  # Employee number + face
    0x65,  # Employee number + password/PIN
    0x69,  # Person + ID card
    0x99,  # Combined verification
})


def _is_successful_access(event: dict) -> bool:
    try:
        return int(event.get("minor_type") or 0) in SUCCESSFUL_ACCESS_MINOR_TYPES
    except (TypeError, ValueError):
        return False


def _event_time(value: str | None):
    if not value:
        return utc_now()
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    except ValueError:
        return utc_now()


def _find_person(db, event: dict):
    employee_no = str(event.get("employee_no") or "").strip()
    if employee_no:
        person = db.query(Person).filter(Person.employee_no == employee_no).first()
        if person:
            return person
    card_number = str(event.get("card_number") or "").strip()
    if card_number:
        issue = db.query(CardIssue).filter(
            CardIssue.card_number == card_number,
            CardIssue.status == "active",
        ).first()
        if issue:
            return db.get(Person, issue.person_id)
        return db.query(Person).filter(Person.card_number == card_number).first()
    return None


def _deactivate_person(db, person: Person) -> None:
    issues = db.query(CardIssue).filter(
        CardIssue.person_id == person.id,
        CardIssue.status == "active",
    ).all()
    device_ids = {issue.device_id for issue in issues}
    if not device_ids and (person.acs_sync_status or "local") == "synced":
        device_ids = {
            row.id
            for row in db.query(AccessControlDevice).filter(
                AccessControlDevice.is_active == 1,
            ).all()
        }

    failures = []
    for device_id in sorted(device_ids):
        device = db.get(AccessControlDevice, device_id)
        if not device:
            continue
        try:
            result = acs_person_delete_isapi_sync(
                device.ip_address,
                device.http_port or 80,
                device.username or "admin",
                decrypt_camera_password(device.password or ""),
                employee_no=person.employee_no or str(person.id),
            )
        except Exception as exc:
            result = {"ok": False, "message": str(exc)}
        if not result.get("ok"):
            failures.append({"device_id": device.id, **result})

    if failures:
        person.acs_sync_status = "error"
        person.acs_sync_error = str(failures)
        logger.error("Access-limit deactivation failed for person %s: %s", person.id, failures)
        return

    for issue in issues:
        issue.status = "revoked"
    person.acs_active = 0
    person.acs_deactivated_at = utc_now()
    person.acs_sync_status = "passive"
    person.acs_sync_error = None
    logger.info(
        "Person %s became passive after %s/%s accesses",
        person.id,
        person.access_times_used,
        person.max_access_times,
    )


def _store_event(
    db,
    device: AccessControlDevice,
    event: dict,
    *,
    count_limit: bool = True,
) -> bool:
    serial_no = event.get("serial_no")
    if serial_no is not None:
        exists = db.query(AcsAccessEvent).filter(
            AcsAccessEvent.device_id == device.id,
            AcsAccessEvent.source_serial_no == int(serial_no),
        ).first()
        if exists:
            return False

    person = _find_person(db, event)
    granted = _is_successful_access(event) and person is not None
    ev_type = "access_granted" if granted else "access_event"
    access_event = AcsAccessEvent(
        device_id=device.id,
        door_no=event.get("door_no"),
        card_number=event.get("card_number"),
        person_id=person.id if person else None,
        event_type=ev_type,
        verify_mode=event.get("verify_mode"),
        source_serial_no=int(serial_no) if serial_no is not None else None,
        created_at=_event_time(event.get("time")),
    )
    db.add(access_event)
    db.flush()

    # Dispatch ACS notification for denied access events
    if not granted and event.get("card_number"):
        try:
            from app.acs_notifications import dispatch_acs_alert
            dispatch_acs_alert(
                db,
                event_type="access_denied",
                person_name=person.full_name if person else None,
                device_name=device.name,
                door_no=event.get("door_no"),
                card_number=event.get("card_number"),
                denial_reason=event.get("denial_reason"),
            )
        except Exception as _ne:
            logger.debug("ACS notification dispatch skipped: %s", _ne)

    if (
        "face" in str(event.get("verify_mode") or "").lower()
        and (
            access_event.person_id is None
            or (person.person_type or "").lower() == "unknown"
        )
    ):
        _capture_access_face(db, device, access_event, event.get("face_rect"))

    if (
        count_limit
        and granted
        and person.acs_active
        and person.max_access_times
        and person.max_access_times > 0
    ):
        db.execute(
            sa_update(Person)
            .where(Person.id == person.id)
            .values(access_times_used=Person.access_times_used + 1)
        )
        db.refresh(person)
        if person.access_times_used >= person.max_access_times:
            _deactivate_person(db, person)
    return True


def _capture_access_face(
    db,
    device: AccessControlDevice,
    access_event: AcsAccessEvent,
    face_rect: dict | None,
) -> None:
    """Capture the terminal image while the access event is still fresh."""
    try:
        from app.isapi_client import isapi_snapshot_sync

        image_bytes = isapi_snapshot_sync(
            device.ip_address,
            device.http_port or 80,
            101,
            device.username or "admin",
            decrypt_camera_password(device.password or ""),
        )
        original_path = save_bytes_to_media(image_bytes, "acs_event")
        original_full_path = full_media_path(original_path)
        detected_faces = extract_faces(original_full_path)
        if not detected_faces:
            try:
                os.remove(original_full_path)
            except OSError:
                pass
            return
        best_face = max(
            detected_faces,
            key=lambda face: float(face.get("det_score") or 0),
        )
        crop_path = crop_face_preview(
            original_full_path,
            best_face.get("bbox"),
            "acs_face",
        )
        if not crop_path:
            return

        db.add(FaceEvent(
            person_id=access_event.person_id,
            camera_ip=device.ip_address,
            camera_name=device.name,
            event_type="recognized" if access_event.person_id else "unknown",
            source="access_controller",
            image_path=original_path,
            crop_image_path=crop_path,
            original_image_path=original_path,
            raw_payload=f"ACS serial={access_event.source_serial_no}",
            created_at=access_event.created_at,
        ))
    except Exception as exc:
        logger.warning(
            "ACS event snapshot failed for serial %s on %s: %s",
            access_event.source_serial_no,
            device.ip_address,
            exc,
        )


def poll_access_limits_once() -> int:
    db = SessionLocal()
    stored = 0
    try:
        devices = db.query(AccessControlDevice).filter(
            AccessControlDevice.is_active == 1,
        ).all()
        for device in devices:
            result = acs_events_query_isapi(
                device.ip_address,
                device.http_port or 80,
                device.username or "admin",
                decrypt_camera_password(device.password or ""),
                major=5,
                max_results=100,
            )
            if not result.get("ok"):
                logger.warning("ACS limit poll failed for %s: %s", device.name, result.get("message"))
                continue
            has_baseline = db.query(AcsAccessEvent).filter(
                AcsAccessEvent.device_id == device.id,
                AcsAccessEvent.source_serial_no.isnot(None),
            ).first() is not None
            for event in reversed(result.get("events", [])):
                if _store_event(db, device, event, count_limit=has_baseline):
                    stored += 1
            db.commit()
        return stored
    except Exception:
        db.rollback()
        logger.exception("ACS access-limit poll failed")
        return stored
    finally:
        db.close()


def _monitor_loop() -> None:
    interval = max(1, int(os.getenv("ACS_LIMIT_POLL_SECONDS", "1")))
    while True:
        from app.distributed import coordinator
        with coordinator.lock(
            "acs-access-limit-poll",
            ttl_seconds=max(5, interval * 4),
        ) as acquired:
            if acquired:
                poll_access_limits_once()
        time.sleep(interval)


def start_access_limit_monitor() -> None:
    global _started
    with _start_lock:
        if _started:
            return
        _started = True
        threading.Thread(
            target=_monitor_loop,
            name="acs-access-limit-monitor",
            daemon=True,
        ).start()
        logger.info("ACS access-limit monitor started")
