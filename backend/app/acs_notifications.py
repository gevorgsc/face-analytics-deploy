"""ACS event notifications — dispatch email/webhook/Telegram on access denial or alarm.

Usage:
    from app.acs_notifications import dispatch_acs_alert
    dispatch_acs_alert(db, event_type="access_denied", person_name="John", ...)
"""

import json
import logging
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)

# ── Config helpers ─────────────────────────────────────────────────────────────

def _smtp_config() -> Optional[dict]:
    host = os.getenv("SMTP_HOST", "")
    user = os.getenv("SMTP_USER", "")
    pw   = os.getenv("SMTP_PASS", "")
    if not host or not user:
        return None
    return {
        "host":      host,
        "port":      int(os.getenv("SMTP_PORT", "587")),
        "username":  user,
        "password":  pw,
        "from_addr": os.getenv("SMTP_FROM", user),
        "use_tls":   os.getenv("SMTP_TLS", "1") == "1",
    }


# ── Core dispatch ──────────────────────────────────────────────────────────────

def _do_dispatch(
    event_type: str,
    person_name: str,
    device_name: str,
    door_no: Optional[int],
    card_number: Optional[str],
    denial_reason: Optional[str],
    notify_emails: list[str],
    notify_webhooks: list[str],
) -> None:
    """Runs in a background thread so it never blocks the request."""
    subject = _build_subject(event_type, person_name, device_name)
    body    = _build_body(event_type, person_name, device_name, door_no, card_number, denial_reason)
    payload = {
        "source":        "acs",
        "event_type":    event_type,
        "person_name":   person_name,
        "device_name":   device_name,
        "door_no":       door_no,
        "card_number":   card_number,
        "denial_reason": denial_reason,
    }

    # Email
    smtp = _smtp_config()
    if smtp and notify_emails:
        try:
            from app.alert_engine import _send_email
            smtp_with_to = {**smtp, "to_addrs": notify_emails}
            ok, msg = _send_email(smtp_with_to, subject, body)
            if not ok:
                logger.warning("ACS notification email failed: %s", msg)
        except Exception as exc:
            logger.warning("ACS notification email error: %s", exc)

    # Webhooks
    for url in notify_webhooks:
        try:
            from app.alert_engine import _send_webhook
            _send_webhook({"url": url}, payload)
        except Exception as exc:
            logger.warning("ACS notification webhook error (%s): %s", url, exc)


def _build_subject(event_type: str, person_name: str, device_name: str) -> str:
    label = {
        "access_denied": "⛔ Access Denied",
        "alarm":         "🚨 ACS Alarm",
        "tamper":        "⚠️ Tamper Detected",
    }.get(event_type, f"ACS Event: {event_type}")
    return f"{label} — {person_name or 'Unknown'} @ {device_name or 'Unknown device'}"


def _build_body(
    event_type: str,
    person_name: str,
    device_name: str,
    door_no: Optional[int],
    card_number: Optional[str],
    denial_reason: Optional[str],
) -> str:
    lines = [
        f"ACS Event: {event_type}",
        f"Person:    {person_name or '—'}",
        f"Card:      {card_number or '—'}",
        f"Device:    {device_name or '—'}",
        f"Door:      {f'Door {door_no}' if door_no else '—'}",
    ]
    if denial_reason:
        lines.append(f"Reason:    {denial_reason}")
    return "\n".join(lines)


# ── Public API ─────────────────────────────────────────────────────────────────

def dispatch_acs_alert(
    db,
    *,
    event_type: str,
    person_name: Optional[str] = None,
    device_name: Optional[str] = None,
    door_no: Optional[int]     = None,
    card_number: Optional[str] = None,
    denial_reason: Optional[str] = None,
) -> None:
    """
    Check DB for ACS alert configs that match this event type and dispatch
    email/webhook notifications asynchronously.

    alert_configs rows with trigger_type in {"acs_denied","acs_alarm","acs_any"}
    are used as ACS notification targets.
    """
    try:
        from app.models import AlertConfig
        from sqlalchemy import or_

        matching_triggers = {"acs_any"}
        if event_type == "access_denied":
            matching_triggers.add("acs_denied")
        elif event_type in {"alarm", "tamper"}:
            matching_triggers.add("acs_alarm")

        configs = (
            db.query(AlertConfig)
            .filter(
                AlertConfig.is_active == 1,
                AlertConfig.trigger_type.in_(matching_triggers),
            )
            .all()
        )

        if not configs:
            return

        notify_emails:   list[str] = []
        notify_webhooks: list[str] = []

        for cfg in configs:
            try:
                channels = json.loads(cfg.channels or "[]")
            except Exception:
                channels = []
            for ch in channels:
                ch_type = ch.get("type", "")
                if ch_type == "email" and ch.get("address"):
                    notify_emails.append(ch["address"])
                elif ch_type == "webhook" and ch.get("url"):
                    notify_webhooks.append(ch["url"])

        if not notify_emails and not notify_webhooks:
            return

        t = threading.Thread(
            target=_do_dispatch,
            args=(
                event_type, person_name or "Unknown",
                device_name or "Unknown", door_no,
                card_number, denial_reason,
                notify_emails, notify_webhooks,
            ),
            daemon=True,
        )
        t.start()

    except Exception as exc:
        logger.warning("dispatch_acs_alert error: %s", exc)
