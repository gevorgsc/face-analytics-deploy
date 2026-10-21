"""
acs_offline.py — Offline card cache for ACS devices.

When an ACS device is unreachable, access decisions fall back to the local
AcsOfflineCard table which is kept in sync when devices are online.
"""

import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models import AcsOfflineCard, CardIssue, AccessControlDevice

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def sync_device_cards(db: Session, device_id: int) -> dict:
    """
    Sync active CardIssue records into AcsOfflineCard cache for a device.
    Returns {"synced": N, "removed": M}
    """
    device = db.get(AccessControlDevice, device_id)
    if not device:
        return {"error": "Device not found"}

    # Get all active cards in DB for this device
    active_cards = (
        db.query(CardIssue)
        .filter(CardIssue.device_id == device_id, CardIssue.status == "active")
        .all()
    )

    # Remove old cache for this device
    removed = (
        db.query(AcsOfflineCard)
        .filter(AcsOfflineCard.device_id == device_id)
        .delete()
    )

    now = _utcnow()
    synced = 0
    for ci in active_cards:
        person = ci.person
        cache_row = AcsOfflineCard(
            device_id   = device_id,
            card_number = ci.card_number,
            person_id   = ci.person_id,
            person_name = person.full_name if person else None,
            person_type = person.person_type if person else None,
            valid_from  = ci.valid_from,
            valid_to    = ci.valid_to,
            is_active   = 1,
            synced_at   = now,
        )
        db.add(cache_row)
        synced += 1

    db.commit()
    logger.info("acs_offline: synced %d cards for device %d (removed %d old)", synced, device_id, removed)
    return {"synced": synced, "removed": removed}


def sync_all_devices(db: Session) -> list[dict]:
    """Sync all active devices."""
    devices = db.query(AccessControlDevice).filter(AccessControlDevice.is_active == 1).all()
    results = []
    for device in devices:
        try:
            result = sync_device_cards(db, device.id)
        except Exception as exc:
            logger.error("acs_offline: sync failed for device %d (%s): %s", device.id, device.name, exc)
            result = {"error": str(exc)}
        result["device_id"] = device.id
        result["device_name"] = device.name
        results.append(result)
    return results


def check_offline_access(
    db: Session,
    device_id: int,
    card_number: str,
) -> dict:
    """
    Check if card_number is permitted offline (device unreachable).
    Returns {"permitted": bool, "person_name": str, "person_type": str, "reason": str}
    """
    now = _utcnow()
    cache_row = (
        db.query(AcsOfflineCard)
        .filter(
            AcsOfflineCard.device_id == device_id,
            AcsOfflineCard.card_number == card_number,
            AcsOfflineCard.is_active == 1,
        )
        .first()
    )

    if not cache_row:
        return {
            "permitted": False,
            "reason": "card_not_in_cache",
            "person_name": None,
            "person_type": None,
        }

    # Check validity period
    if cache_row.valid_from and now < cache_row.valid_from.replace(tzinfo=None):
        return {
            "permitted": False,
            "reason": "card_not_yet_valid",
            "person_name": cache_row.person_name,
            "person_type": cache_row.person_type,
        }

    if cache_row.valid_to and now > cache_row.valid_to.replace(tzinfo=None):
        return {
            "permitted": False,
            "reason": "card_expired",
            "person_name": cache_row.person_name,
            "person_type": cache_row.person_type,
        }

    # Blacklist check — deny if person_type is blacklist
    if cache_row.person_type == "blacklist":
        return {
            "permitted": False,
            "reason": "blacklisted",
            "person_name": cache_row.person_name,
            "person_type": cache_row.person_type,
        }

    return {
        "permitted": True,
        "reason": "offline_cache_permit",
        "person_name": cache_row.person_name,
        "person_type": cache_row.person_type,
        "person_id": cache_row.person_id,
        "cached_at": cache_row.synced_at,
    }
