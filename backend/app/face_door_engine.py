"""
face_door_engine.py — Auto-unlock ACS doors when a face is recognized.

Flow:
  FaceEvent created (person_id set, confidence >= threshold)
      → check CameraDoorMapping for this camera
      → verify person_type is in allowed_types
      → check cooldown (AcsFaceMatchCache)
      → call ISAPI door unlock on matched ACS device
      → log AcsAccessEvent (access_granted or access_denied)
      → broadcast via WebSocket
"""

import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import (
    AcsDenialLog, AcsFaceMatchCache, AcsAccessEvent,
    CameraDoorMapping, Person, AccessControlDevice,
)
from app.secrets import decrypt_camera_password

logger = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=4)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def handle_face_event(
    db: Session,
    person_id: int | None,
    camera_id: int | None,
    confidence: float | None,
    person_type: str | None,
    broadcast_fn=None,   # async callable(dict) — WebSocket broadcast
) -> None:
    """Called after a FaceEvent is saved. Checks mappings and triggers door unlocks."""
    if not person_id or not camera_id:
        return

    mappings = (
        db.query(CameraDoorMapping)
        .filter(
            CameraDoorMapping.camera_id == camera_id,
            CameraDoorMapping.is_active == 1,
        )
        .all()
    )
    if not mappings:
        return

    for mapping in mappings:
        await _process_mapping(
            db, mapping, person_id, confidence, person_type, broadcast_fn
        )


async def _process_mapping(
    db: Session,
    mapping: CameraDoorMapping,
    person_id: int,
    confidence: float | None,
    person_type: str | None,
    broadcast_fn,
) -> None:
    now = _utcnow()

    # 1. Confidence check
    min_conf = mapping.min_confidence or 0.65
    if confidence is not None and confidence < min_conf:
        _log_denial(db, mapping, person_id, "low_confidence",
                    f"confidence {confidence:.2f} < {min_conf}")
        return

    # 2. Person type check
    try:
        allowed = json.loads(mapping.allowed_types or '["employee","vip"]')
    except Exception:
        allowed = ["employee", "vip"]

    if person_type and person_type not in allowed:
        _log_denial(db, mapping, person_id, "no_access",
                    f"person_type '{person_type}' not in allowed {allowed}")
        _broadcast_denial(broadcast_fn, mapping, person_id, person_type, "no_access")
        return

    # 3. Cooldown check
    cooldown = mapping.cooldown_seconds or 5
    recent = (
        db.query(AcsFaceMatchCache)
        .filter(
            AcsFaceMatchCache.person_id == person_id,
            AcsFaceMatchCache.camera_id == mapping.camera_id,
            AcsFaceMatchCache.matched_at >= now - timedelta(seconds=cooldown),
        )
        .first()
    )
    if recent:
        logger.debug("face_door: cooldown active for person %d", person_id)
        return

    # 4. Get ACS device
    device = db.get(AccessControlDevice, mapping.acs_device_id)
    if not device or not device.is_active:
        _log_denial(db, mapping, person_id, "device_offline", "ACS device not active")
        return

    # 5. Enforce platform anti-passback before issuing a physical unlock.
    anti_passback = {"allowed": True}
    try:
        from app.routers.acs_anti_passback import check_and_update
        anti_passback = check_and_update(
            db,
            person_id,
            device.id,
            mapping.door_no or 1,
            update_state=False,
            record_violation=True,
        )
    except Exception:
        logger.exception("face_door: anti-passback preflight failed")
    if not anti_passback.get("allowed", True):
        _log_denial(
            db,
            mapping,
            person_id,
            "anti_passback",
            f"rule={anti_passback.get('rule_id')} direction={anti_passback.get('direction')}",
        )
        db.add(AcsAccessEvent(
            device_id=device.id,
            door_no=mapping.door_no or 1,
            person_id=person_id,
            event_type="access_denied",
            verify_mode="face",
            denial_reason="anti_passback",
            direction=anti_passback.get("direction"),
            created_at=now,
        ))
        db.commit()
        _broadcast_denial(
            broadcast_fn,
            mapping,
            person_id,
            person_type,
            "anti_passback",
        )
        return

    # 6. Record face match cache
    cache_entry = AcsFaceMatchCache(
        person_id=person_id,
        camera_id=mapping.camera_id,
        confidence=confidence,
        matched_at=now,
    )
    db.add(cache_entry)
    db.flush()

    # 7. Trigger door unlock via ISAPI (non-blocking)
    password = decrypt_camera_password(device.password or "") if device.password else ""
    ok = False
    try:
        from app.hiksdk_client import acs_door_control_isapi_sync
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            _executor,
            acs_door_control_isapi_sync,
            device.ip_address,
            device.http_port or 80,
            device.username or "admin",
            password,
            mapping.door_no or 1,
            "unlock",
        )
        ok = result.get("ok", False)
        logger.info(
            "face_door: door %d on %s → %s (person %d)",
            mapping.door_no, device.ip_address, "OK" if ok else "FAIL", person_id,
        )
    except Exception as exc:
        logger.warning("face_door: ISAPI unlock failed: %s", exc)

    if ok and not anti_passback.get("violation"):
        try:
            from app.routers.acs_anti_passback import check_and_update
            anti_passback = check_and_update(
                db,
                person_id,
                device.id,
                mapping.door_no or 1,
                update_state=True,
                record_violation=False,
            )
        except Exception:
            logger.exception("face_door: anti-passback state update failed")

    # 8. Log ACS access event
    ev = AcsAccessEvent(
        device_id=device.id,
        door_no=mapping.door_no or 1,
        person_id=person_id,
        event_type="access_granted" if ok else "access_denied",
        verify_mode="face",
        denial_reason=None if ok else "unlock_failed",
        direction=anti_passback.get("direction"),
        created_at=now,
    )
    db.add(ev)
    db.commit()

    # Update attendance records from this ACS event
    try:
        from app.acs_attendance import process_acs_event
        process_acs_event(db, ev)
    except Exception:
        pass

    # 9. WebSocket broadcast
    if broadcast_fn:
        person = db.get(Person, person_id)
        payload = {
            "type": "acs_face_unlock",
            "device_id": device.id,
            "device_name": device.name,
            "door_no": mapping.door_no or 1,
            "person_id": person_id,
            "person_name": person.full_name if person else None,
            "person_type": person_type,
            "confidence": confidence,
            "success": ok,
            "ts": now.isoformat(),
        }
        try:
            await broadcast_fn(payload)
        except Exception:
            pass


def _log_denial(
    db: Session,
    mapping: CameraDoorMapping,
    person_id: int,
    reason: str,
    detail: str = "",
) -> None:
    log = AcsDenialLog(
        device_id=mapping.acs_device_id,
        door_no=mapping.door_no,
        person_id=person_id,
        denial_reason=reason,
        detail=detail,
        source="face_engine",
        created_at=_utcnow(),
    )
    db.add(log)
    try:
        db.commit()
    except Exception:
        db.rollback()


def _broadcast_denial(broadcast_fn, mapping, person_id, person_type, reason):
    if not broadcast_fn:
        return
    try:
        import asyncio
        payload = {
            "type": "acs_access_denied",
            "device_id": mapping.acs_device_id,
            "door_no": mapping.door_no,
            "person_id": person_id,
            "person_type": person_type,
            "reason": reason,
        }
        asyncio.create_task(broadcast_fn(payload))
    except Exception:
        pass


async def cleanup_face_match_cache(db: Session, max_age_seconds: int = 300) -> int:
    """Remove old face match cache entries. Call periodically."""
    cutoff = _utcnow() - timedelta(seconds=max_age_seconds)
    deleted = (
        db.query(AcsFaceMatchCache)
        .filter(AcsFaceMatchCache.matched_at < cutoff)
        .delete()
    )
    db.commit()
    return deleted
