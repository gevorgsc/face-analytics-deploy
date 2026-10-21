import asyncio
import base64
import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.acs_schedule import validate_schedule_config
from app.models import (
    AccessControlDevice,
    AccessLevel,
    AccessLevelMember,
    CardIssue,
    Person,
)
from app.secrets import decrypt_camera_password
from app.utils import full_media_path, save_bytes_to_media, utc_now
from app.hiksdk_client import (
    acs_face_upsert_isapi_sync,
    acs_person_photo_upload_isapi_sync,
    acs_person_upsert_isapi_sync,
    acs_person_delete_isapi_sync,
)
from app.isapi_acs import (
    card_delete_isapi,
    card_push_isapi,
    fingerprints_replace_isapi,
    user_right_plan_template_get_isapi,
)

logger = logging.getLogger(__name__)

# Re-define helper functions from acs_person_management.py
def _person_card_numbers(person: Person) -> list[str]:
    try:
        values = json.loads(person.card_numbers or "[]")
    except (TypeError, json.JSONDecodeError):
        values = []
    if person.card_number:
        values.insert(0, person.card_number)
    return list(dict.fromkeys(
        str(value).strip()
        for value in values
        if str(value or "").strip()
    ))[:5]

def _person_fingerprints(person: Person) -> list[dict]:
    try:
        values = json.loads(person.fingerprints or "[]")
    except (TypeError, json.JSONDecodeError):
        values = []
    return [
        {
            "finger_no": int(value["finger_no"]),
            "quality": int(value.get("quality") or 0),
            "template": str(value["template"]),
        }
        for value in values
        if value.get("finger_no") and value.get("template")
    ][:10]


def resolve_person_right_plans(
    db: Session,
    person_id: int,
) -> tuple[dict[int, dict[int, int]], list[dict]]:
    """Resolve one controller plan template per person/device/door."""
    memberships = (
        db.query(AccessLevelMember)
        .filter(AccessLevelMember.person_id == person_id)
        .all()
    )
    level_ids = {membership.access_level_id for membership in memberships}
    levels = []
    if level_ids:
        levels = (
            db.query(AccessLevel)
            .filter(AccessLevel.id.in_(level_ids), AccessLevel.is_active == 1)
            .all()
        )

    candidates: dict[int, dict[int, list[dict]]] = {}
    for level in levels:
        try:
            schedule = validate_schedule_config(json.loads(level.schedule_config or "{}"))
        except Exception as exc:
            schedule = {"controller_plan_template_no": None}
            schedule_error = str(exc)
        else:
            schedule_error = None
        plan_no = schedule.get("controller_plan_template_no")
        for rule in json.loads(level.door_rules or "[]"):
            device_id = int(rule.get("device_id") or 0)
            if not device_id:
                continue
            for door_no in rule.get("door_numbers") or []:
                candidates.setdefault(device_id, {}).setdefault(int(door_no), []).append({
                    "level_id": level.id,
                    "level_name": level.name,
                    "plan_template_no": plan_no,
                    "error": schedule_error,
                })

    resolved: dict[int, dict[int, int]] = {}
    issues = []
    for device_id, doors in candidates.items():
        for door_no, assignments in doors.items():
            plans = {
                item["plan_template_no"]
                for item in assignments
                if item["plan_template_no"] is not None
            }
            unmapped = [item for item in assignments if item["plan_template_no"] is None]
            if unmapped:
                issues.append({
                    "type": "schedule_unmapped",
                    "device_id": device_id,
                    "door_no": door_no,
                    "levels": unmapped,
                    "message": "Access level schedule is not mapped to a controller plan template",
                })
                continue
            if len(plans) > 1:
                issues.append({
                    "type": "schedule_conflict",
                    "device_id": device_id,
                    "door_no": door_no,
                    "levels": assignments,
                    "message": "Multiple access levels assign different plan templates to the same door",
                })
                continue
            if plans:
                resolved.setdefault(device_id, {})[door_no] = next(iter(plans))
    return resolved, issues

class ACSPersonService:
    def __init__(self, db: Session, executor: Any, ws_manager: Any):
        self.db = db
        self.executor = executor
        self.ws_manager = ws_manager

    async def _sync_person_to_devices(
        self,
        person: Person,
        card_numbers: list[str],
        device_ids: list[int],
        door_numbers_by_device: dict[int, list[int]],
        photo_bytes: bytes | None,
    ) -> list[dict]:
        loop = asyncio.get_running_loop()
        results = []
        right_plans_by_device, schedule_issues = resolve_person_right_plans(
            self.db,
            person.id,
        )
        for device_id in device_ids:
            device = self.db.get(AccessControlDevice, int(device_id))
            if not device or not device.is_active:
                results.append({"device_id": device_id, "ok": False, "message": "Device not found or disabled"})
                continue
            device_schedule_issues = [
                issue for issue in schedule_issues
                if issue["device_id"] == device.id
            ]
            if device_schedule_issues:
                results.append({
                    "device_id": device.id,
                    "device_name": device.name,
                    "ok": False,
                    "message": "Access schedule mapping must be fixed before provisioning",
                    "schedule_issues": device_schedule_issues,
                })
                continue
            password = decrypt_camera_password(device.password or "")
            try:
                plan_checks = []
                for plan_no in sorted(set(right_plans_by_device.get(device.id, {}).values())):
                    plan_check = await loop.run_in_executor(
                        self.executor,
                        user_right_plan_template_get_isapi,
                        device.ip_address,
                        device.http_port or 80,
                        device.username or "admin",
                        password,
                        plan_no,
                    )
                    plan_checks.append(plan_check)
                invalid_plans = [item for item in plan_checks if not item.get("ok")]
                if invalid_plans:
                    results.append({
                        "device_id": device.id,
                        "device_name": device.name,
                        "ok": False,
                        "message": "Controller plan template validation failed",
                        "plan_checks": plan_checks,
                    })
                    continue
                person_result = await loop.run_in_executor(
                    self.executor,
                    lambda d=device: acs_person_upsert_isapi_sync(
                        d.ip_address, d.http_port or 80, d.username or "admin", password,
                        employee_no=person.employee_no or str(person.id),
                        full_name=person.full_name or "",
                        card_number="",
                        pin_code=person.pin_code or "",
                        valid_from=person.valid_from,
                        valid_to=person.valid_to,
                        door_numbers=door_numbers_by_device.get(device.id, [1]),
                        right_plans=right_plans_by_device.get(device.id, {}),
                        device_administrator=bool(person.device_administrator),
                    ),
                )
                existing_cards = self.db.query(CardIssue).filter(
                    CardIssue.person_id == person.id,
                    CardIssue.device_id == device.id,
                    CardIssue.status == "active",
                ).all()
                requested_cards = set(card_numbers)
                card_results = []
                for issue in existing_cards:
                    if issue.card_number in requested_cards:
                        continue
                    delete_result = await loop.run_in_executor(
                        self.executor,
                        card_delete_isapi,
                        device.ip_address,
                        device.http_port or 80,
                        device.username or "admin",
                        password,
                        issue.card_number,
                    )
                    card_results.append({
                        "card_number": issue.card_number,
                        "action": "delete",
                        **delete_result,
                    })
                    if delete_result.get("ok"):
                        self.db.delete(issue)

                for card_number in card_numbers:
                    push_result = await loop.run_in_executor(
                        self.executor,
                        card_push_isapi,
                        device.ip_address,
                        device.http_port or 80,
                        device.username or "admin",
                        password,
                        card_number,
                        person.employee_no or str(person.id),
                        person.full_name or "",
                        "normalCard",
                        person.valid_from.strftime("%Y-%m-%d") if person.valid_from else "",
                        person.valid_to.strftime("%Y-%m-%d") if person.valid_to else "",
                    )
                    card_results.append({
                        "card_number": card_number,
                        "action": "upsert",
                        **push_result,
                    })
                    issue = next(
                        (row for row in existing_cards if row.card_number == card_number),
                        None,
                    )
                    if issue:
                        issue.valid_from = person.valid_from
                        issue.valid_to = person.valid_to
                        issue.status = "active" if push_result.get("ok") else "error"
                    else:
                        self.db.add(CardIssue(
                            person_id=person.id,
                            device_id=device.id,
                            card_number=card_number,
                            card_type="normal",
                            valid_from=person.valid_from,
                            valid_to=person.valid_to,
                            status="active" if push_result.get("ok") else "error",
                            note="Provisioned by Person Management",
                        ))
                fingerprint_result = await loop.run_in_executor(
                    self.executor,
                    fingerprints_replace_isapi,
                    device.ip_address,
                    device.http_port or 80,
                    device.username or "admin",
                    password,
                    person.employee_no or str(person.id),
                    _person_fingerprints(person),
                )
                face_result = None
                photo_result = None
                if person_result.get("ok") and photo_bytes:
                    face_result = await loop.run_in_executor(
                        self.executor,
                        lambda d=device: acs_face_upsert_isapi_sync(
                            d.ip_address, d.http_port or 80, d.username or "admin", password,
                            employee_no=person.employee_no or str(person.id),
                            full_name=person.full_name or "",
                            gender=person.gender or "unknown",
                            face_image_bytes=photo_bytes,
                        ),
                    )
                    photo_result = await loop.run_in_executor(
                        self.executor,
                        lambda d=device: acs_person_photo_upload_isapi_sync(
                            d.ip_address, d.http_port or 80, d.username or "admin", password,
                            employee_no=person.employee_no or str(person.id),
                            photo_bytes=photo_bytes,
                        ),
                    )
                cards_ok = all(item.get("ok") for item in card_results)
                ok = (
                    bool(person_result.get("ok"))
                    and cards_ok
                    and bool(fingerprint_result.get("ok"))
                    and (face_result is None or bool(face_result.get("ok")))
                    and (photo_result is None or bool(photo_result.get("ok")))
                )
                results.append({
                    "device_id": device.id,
                    "device_name": device.name,
                    "ok": ok,
                    "person": person_result,
                    "cards": card_results,
                    "fingerprints": fingerprint_result,
                    "face": face_result,
                    "photo": photo_result,
                    "plan_checks": plan_checks,
                })
            except Exception as exc:
                results.append({"device_id": device.id, "device_name": device.name, "ok": False, "message": str(exc)})
        self.db.commit() # Commit card issue changes
        return results

    async def _remove_person_from_devices(
        self,
        person: Person,
        device_ids: set[int],
    ) -> list[dict]:
        loop = asyncio.get_running_loop()
        results = []
        for device_id in sorted(device_ids):
            device = self.db.get(AccessControlDevice, device_id)
            if not device:
                results.append({
                    "device_id": device_id,
                    "ok": False,
                    "message": "Controller not found",
                })
                continue
            password = decrypt_camera_password(device.password or "")
            try:
                result = await loop.run_in_executor(
                    self.executor,
                    lambda d=device, p=password: acs_person_delete_isapi_sync(
                        d.ip_address,
                        d.http_port or 80,
                        d.username or "admin",
                        p,
                        employee_no=person.employee_no or str(person.id),
                    ),
                )
                results.append({
                    "device_id": device.id,
                    "device_name": device.name,
                    **result,
                })
            except Exception as exc:
                results.append({
                    "device_id": device.id,
                    "device_name": device.name,
                    "ok": False,
                    "message": str(exc),
                })
        return results

    async def synchronize_person_to_hardware(
        self,
        person_id: int,
        card_numbers: list[str],
        device_ids: list[int],
        normalized_doors: dict[int, list[int]],
        photo_bytes: bytes | None,
        previous_device_ids: set[int],
        credentials_changed: bool,
    ):
        person = self.db.get(Person, person_id)
        if not person:
            logger.error(f"Background sync failed: Person {person_id} not found.")
            return

        all_sync_results = []

        # Handle removed devices
        removed_device_ids = previous_device_ids - set(device_ids)
        if removed_device_ids:
            removal_results = await self._remove_person_from_devices(person, removed_device_ids)
            all_sync_results.extend(removal_results)
            removal_failures = [item for item in removal_results if not item.get("ok")]
            if removal_failures:
                logger.error(f"Failed to remove person {person_id} from some devices: {removal_failures}")
                # Don't raise, just log and continue with other syncs
            else:
                self.db.query(CardIssue).filter(
                    CardIssue.person_id == person.id,
                    CardIssue.device_id.in_(removed_device_ids),
                ).delete(synchronize_session=False)
                self.db.commit()

        # Handle credential changes requiring re-creation
        recreate_device_ids = previous_device_ids.intersection(set(device_ids)) if credentials_changed else set()
        if recreate_device_ids:
            recreation_results = await self._remove_person_from_devices(person, recreate_device_ids)
            all_sync_results.extend(recreation_results)
            recreation_failures = [item for item in recreation_results if not item.get("ok")]
            if recreation_failures:
                logger.error(f"Failed to refresh credentials for person {person_id} on some devices: {recreation_failures}")
            else:
                self.db.query(CardIssue).filter(
                    CardIssue.person_id == person.id,
                    CardIssue.device_id.in_(recreate_device_ids),
                ).delete(synchronize_session=False)
                self.db.commit()

        # Sync to selected devices
        if device_ids and person.acs_active:
            sync_results = await self._sync_person_to_devices(
                person,
                card_numbers,
                device_ids,
                normalized_doors,
                photo_bytes,
            )
            all_sync_results.extend(sync_results)
            failures = [item for item in sync_results if not item.get("ok")]
            person.acs_sync_status = "error" if failures else "synced"
            person.acs_sync_error = json.dumps(failures, default=str) if failures else None
        elif person.acs_active:
            person.acs_sync_status = "local"
            person.acs_sync_error = None
        else:
            person.acs_sync_status = "passive"
            person.acs_sync_error = None

        self.db.commit()
        self.db.refresh(person)
        await self.ws_manager.broadcast({
            "type": "acs_person_updated",
            "person_id": person.id,
            "acs_sync_status": person.acs_sync_status,
            "acs_sync_error": person.acs_sync_error,
        })
        logger.info(f"Background sync for person {person.id} completed with status: {person.acs_sync_status}")

    async def delete_person_from_hardware(self, person_id: int):
        person = self.db.get(Person, person_id)
        if not person:
            logger.error(f"Background delete failed: Person {person_id} not found.")
            return

        employee_no = person.employee_no or str(person.id)
        loop = asyncio.get_running_loop()

        card_issues = (
            self.db.query(CardIssue)
            .filter(CardIssue.person_id == person_id)
            .all()
        )
        seen_device_ids: set[int] = {ci.device_id for ci in card_issues if ci.device_id}

        should_delete_from_devices = bool(seen_device_ids) or (
            (person.acs_sync_status or "local") != "local"
        )

        target_devices = []
        if not seen_device_ids and should_delete_from_devices:
            target_devices = self.db.query(AccessControlDevice).filter(AccessControlDevice.is_active == 1).all()
        elif should_delete_from_devices:
            target_devices = [self.db.get(AccessControlDevice, did) for did in seen_device_ids if self.db.get(AccessControlDevice, did)]

        delete_results = []
        attempted_ids: set[int] = set()
        for device in target_devices:
            if not device or device.id in attempted_ids:
                continue
            attempted_ids.add(device.id)
            password = decrypt_camera_password(device.password or "")
            try:
                result = await loop.run_in_executor(
                    self.executor,
                    lambda d=device: acs_person_delete_isapi_sync(
                        d.ip_address, d.http_port or 80, d.username or "admin", password,
                        employee_no=employee_no,
                    ),
                )
                delete_results.append({"device_id": device.id, "device_name": device.name, **result})
            except Exception as exc:
                delete_results.append({"device_id": device.id, "device_name": device.name, "ok": False, "message": str(exc)})

        failures = [item for item in delete_results if not item.get("ok")]
        if failures:
            logger.error(f"Background delete failed for person {person_id} on some devices: {failures}")
            # The person record will be deleted from DB anyway, but this logs the hardware failure.
        else:
            logger.info(f"Background delete for person {person_id} from hardware completed successfully.")

        # No need to update person.acs_sync_status as the person record is being deleted.
        # The WebSocket broadcast for deletion will be handled by the router.


async def synchronize_person_background(
    executor: Any,
    ws_manager: Any,
    person_id: int,
    card_numbers: list[str],
    device_ids: list[int],
    normalized_doors: dict[int, list[int]],
    photo_bytes: bytes | None,
    previous_device_ids: set[int],
    credentials_changed: bool,
) -> None:
    db = SessionLocal()
    try:
        service = ACSPersonService(db, executor, ws_manager)
        await service.synchronize_person_to_hardware(
            person_id,
            card_numbers,
            device_ids,
            normalized_doors,
            photo_bytes,
            previous_device_ids,
            credentials_changed,
        )
    except Exception:
        db.rollback()
        logger.exception("Background person synchronization failed for person %s", person_id)
    finally:
        db.close()


async def delete_person_from_hardware_background(
    executor: Any,
    ws_manager: Any,
    person_id: int,
) -> None:
    db = SessionLocal()
    try:
        service = ACSPersonService(db, executor, ws_manager)
        await service.delete_person_from_hardware(person_id)
    except Exception:
        db.rollback()
        logger.exception("Background hardware deletion failed for person %s", person_id)
    finally:
        db.close()
