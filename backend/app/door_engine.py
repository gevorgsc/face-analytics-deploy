"""door_engine.py - Fire HTTP relay triggers on face match events."""
import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.models import DoorConfig, Person

logger = logging.getLogger(__name__)

# Per-door cooldown tracker: door_id в†’ last_triggered_ts
_last_triggered: dict[int, float] = {}
_lock = threading.Lock()


def fire_door_triggers(db, person: Optional[Person], confidence: float) -> None:
    """Called synchronously from process_faces_and_create_events (in thread pool context)."""
    if not person:
        return

    ptype = person.person_type or "unknown"
    doors = db.query(DoorConfig).filter(DoorConfig.is_active == 1).all()
    if not doors:
        return

    now = time.monotonic()
    for door in doors:
        try:
            trigger_types = json.loads(door.trigger_types or '["employee","vip"]')
        except Exception:
            trigger_types = ["employee", "vip"]

        if ptype not in trigger_types:
            continue
        if (confidence or 0.0) < (door.min_confidence or 0.5):
            continue

        with _lock:
            last = _last_triggered.get(door.id, 0)
            if now - last < (door.cooldown_seconds or 5):
                continue
            _last_triggered[door.id] = now

        # Fire in a daemon thread to not block the event pipeline
        threading.Thread(
            target=_send,
            args=(door.id, door.trigger_url, door.http_method,
                  json.loads(door.headers or "{}"),
                  door.payload_template, person, confidence),
            daemon=True,
        ).start()


def _send(door_id: int, url: str, method: str, headers: dict,
          payload_template: Optional[str], person: Person, confidence: float) -> None:
    if payload_template:
        try:
            payload = json.loads(
                payload_template
                .replace("{person_id}",   str(person.id))
                .replace("{person_name}", person.full_name or "")
                .replace("{person_type}", person.person_type or "")
                .replace("{confidence}",  str(round(confidence, 3)))
            )
        except Exception:
            payload = {"person_id": person.id, "confidence": round(confidence, 3)}
    else:
        payload = {
            "person_id":   person.id,
            "person_name": person.full_name or f"Unknown #{person.id}",
            "person_type": person.person_type or "unknown",
            "confidence":  round(confidence, 3),
            "triggered_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        with httpx.Client(timeout=4) as client:
            fn = getattr(client, method.lower(), client.post)
            resp = fn(url, json=payload, headers=headers)
        logger.info("Door %d triggered в†’ %s %d", door_id, url, resp.status_code)
    except Exception as e:
        logger.warning("Door %d trigger failed: %s", door_id, e)
