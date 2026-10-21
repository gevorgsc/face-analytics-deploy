"""Alert engine - send notifications via Email, Slack, or Webhook when events occur."""

import json
import logging
import mimetypes
import os
import smtplib
import threading
from datetime import timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
from urllib.request import urlopen, Request as UrlRequest
from urllib.error import URLError

logger = logging.getLogger(__name__)

_alert_lock = threading.Lock()
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_DIR = os.path.join(BASE_DIR, "media")


def _send_email(config: dict, subject: str, body: str) -> tuple[bool, str]:
    """Send email via SMTP. config: {host, port, username, password, from_addr, to_addrs[]}"""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = config.get("from_addr", config.get("username", ""))
        recipients = config.get("to_addrs", [])
        if isinstance(recipients, str):
            recipients = [recipients]
        msg["To"] = ", ".join(recipients)
        msg.attach(MIMEText(body, "plain"))
        msg.attach(MIMEText(f"<pre>{body}</pre>", "html"))

        host = config.get("host", "localhost")
        port = int(config.get("port", 587))
        use_tls = bool(config.get("use_tls", True))

        server = smtplib.SMTP(host, port, timeout=10)
        try:
            if use_tls:
                server.ehlo()
                server.starttls()
            username = config.get("username")
            password = config.get("password")
            if username and password:
                server.login(username, password)
            server.sendmail(msg["From"], recipients, msg.as_string())
        finally:
            server.quit()
        return True, "ok"
    except Exception as e:
        return False, str(e)


def _send_slack(config: dict, message: str) -> tuple[bool, str]:
    """Send Slack message via Incoming Webhook. config: {webhook_url, channel?}"""
    try:
        webhook_url = config.get("webhook_url", "")
        if not webhook_url:
            return False, "No webhook_url in Slack config"

        payload = {"text": message}
        if config.get("channel"):
            payload["channel"] = config["channel"]

        data = json.dumps(payload).encode("utf-8")
        req = UrlRequest(webhook_url, data=data, headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=10) as resp:
            return resp.status == 200, f"HTTP {resp.status}"
    except URLError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)


def _send_webhook(config: dict, payload: dict) -> tuple[bool, str]:
    """POST event payload to a custom webhook URL. config: {url, secret?, headers?}"""
    try:
        url = config.get("url", "")
        if not url:
            return False, "No URL in webhook config"

        data = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}

        extra_headers = config.get("headers") or {}
        if isinstance(extra_headers, str):
            try:
                extra_headers = json.loads(extra_headers)
            except Exception:
                extra_headers = {}
        headers.update(extra_headers)

        if config.get("secret"):
            import hmac, hashlib
            sig = hmac.new(config["secret"].encode(), data, hashlib.sha256).hexdigest()
            headers["X-Signature-SHA256"] = sig

        req = UrlRequest(url, data=data, headers=headers, method="POST")
        with urlopen(req, timeout=10) as resp:
            return resp.status < 400, f"HTTP {resp.status}"
    except URLError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)


def _media_file_path(public_path: str | None) -> str | None:
    if not public_path:
        return None
    clean = str(public_path).replace("\\", "/").lstrip("/")
    if clean.startswith("media/"):
        clean = clean[len("media/"):]
    path = os.path.abspath(os.path.join(MEDIA_DIR, clean))
    if not path.startswith(os.path.abspath(MEDIA_DIR) + os.sep):
        return None
    return path if os.path.exists(path) else None


def _multipart_form(fields: dict, file_field: str, file_path: str) -> tuple[bytes, str]:
    boundary = "----faceanalyticsprotelegram"
    parts = []
    for key, value in fields.items():
        parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
            f"{value}\r\n".encode("utf-8")
        )

    filename = os.path.basename(file_path)
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    with open(file_path, "rb") as fh:
        file_bytes = fh.read()
    parts.append(
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n".encode("utf-8")
        + file_bytes
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(parts), boundary


def _send_telegram(config: dict, message: str, event_data: dict) -> tuple[bool, str]:
    try:
        bot_token = (config.get("bot_token") or "").strip()
        chat_id = (config.get("chat_id") or "").strip()
        if not bot_token or not chat_id:
            return False, "Telegram bot token and chat id are required"

        api_base = f"https://api.telegram.org/bot{bot_token}"
        image_path = None
        if config.get("send_photo", True):
            image_path = (
                _media_file_path(event_data.get("crop_image_path"))
                or _media_file_path(event_data.get("image_path"))
                or _media_file_path(event_data.get("original_image_path"))
            )

        if image_path:
            body, boundary = _multipart_form(
                {"chat_id": chat_id, "caption": message[:1024]},
                "photo",
                image_path,
            )
            req = UrlRequest(
                f"{api_base}/sendPhoto",
                data=body,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                method="POST",
            )
        else:
            body = json.dumps({"chat_id": chat_id, "text": message}).encode("utf-8")
            req = UrlRequest(
                f"{api_base}/sendMessage",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

        with urlopen(req, timeout=15) as resp:
            return resp.status < 400, f"HTTP {resp.status}"
    except URLError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)


def build_alert_message(event_data: dict) -> str:
    """Build a human-readable alert message from face event data."""
    person_name = event_data.get("person_name") or "Unknown"
    person_type = event_data.get("person_type") or "unknown"
    camera_name = event_data.get("camera_name") or "Unknown Camera"
    confidence = event_data.get("confidence")
    timestamp = event_data.get("created_at") or "unknown time"
    event_id = event_data.get("event_id")

    conf_str = f"{round(float(confidence) * 100, 1)}%" if confidence is not None else "N/A"

    if person_type == "blacklist":
        emoji = "[ALERT]"
        type_label = "BLACKLIST person"
    elif person_type == "vip":
        emoji = "[VIP]"
        type_label = "VIP"
    else:
        emoji = "[INFO]"
        type_label = person_type.upper()

    return (
        f"{emoji} Face Analytics Pro Alert\n"
        f"Person: {person_name} ({type_label})\n"
        f"Camera: {camera_name}\n"
        f"Confidence: {conf_str}\n"
        f"Time: {timestamp}\n"
        f"Event ID: {event_id or 'N/A'}"
    )


def dispatch_alert(alert_config, event_data: dict, db=None):
    """Send alerts for a matched AlertConfig. Runs in background thread."""
    try:
        channels_raw = alert_config.channels or "[]"
        if isinstance(channels_raw, str):
            channels = json.loads(channels_raw)
        else:
            channels = channels_raw

        message = build_alert_message(event_data)
        subject = f"[Face Analytics] Alert: {event_data.get('person_type', 'unknown').upper()} detected"

        for channel in channels:
            ch_type = channel.get("type", "").lower()
            ch_config = channel.get("config") or {}

            ok, err = False, "unknown channel type"
            if ch_type == "email":
                ok, err = _send_email(ch_config, subject, message)
            elif ch_type == "slack":
                ok, err = _send_slack(ch_config, message)
            elif ch_type == "telegram":
                ok, err = _send_telegram(ch_config, message, event_data)
            elif ch_type == "webhook":
                ok, err = _send_webhook(ch_config, event_data)

            if db:
                try:
                    from app.models import AlertEvent
                    alert_event = AlertEvent(
                        alert_config_id=alert_config.id,
                        face_event_id=event_data.get("event_id"),
                        person_id=event_data.get("person_id"),
                        person_type=event_data.get("person_type"),
                        channel_type=ch_type,
                        status="sent" if ok else "failed",
                        error_message=None if ok else err[:500],
                    )
                    db.add(alert_event)
                    db.commit()
                except Exception as dbe:
                    logger.warning("Failed to write AlertEvent: %s", dbe)

            if ok:
                logger.info("Alert sent via %s for event %s", ch_type, event_data.get("event_id"))
            else:
                logger.warning("Alert failed via %s: %s", ch_type, err)

    except Exception as e:
        logger.error("dispatch_alert error: %s", e)


def check_and_fire_alerts(db, face_event, person) -> None:
    """Check if any AlertConfig matches this event and fire alerts asynchronously."""
    from app.models import AlertConfig, AlertEvent
    from app.utils import utc_now
    from datetime import timedelta

    try:
        person_type = person.person_type if person else "unknown"
        confidence = face_event.confidence or 0.0

        # Find active alert configs that match this person type
        configs = db.query(AlertConfig).filter(
            AlertConfig.is_active == 1,
        ).all()

        for config in configs:
            trigger = config.trigger_person_type or "blacklist"
            if trigger != "any" and trigger != person_type:
                continue
            if confidence < (config.min_confidence or 0.0):
                continue

            # Cooldown check: skip if we already alerted for this person recently
            cooldown = config.cooldown_seconds or 300
            since = utc_now() - timedelta(seconds=cooldown)
            recent = db.query(AlertEvent).filter(
                AlertEvent.alert_config_id == config.id,
                AlertEvent.person_id == (person.id if person else None),
                AlertEvent.created_at >= since,
                AlertEvent.status == "sent",
            ).first()
            if recent:
                continue

            event_data = {
                "event_id": face_event.id,
                "person_id": person.id if person else None,
                "person_name": (person.full_name or getattr(person, "unknown_label", None) or "Unknown") if person else "Unknown",
                "person_type": person_type,
                "camera_name": face_event.camera_name,
                "confidence": confidence,
                "created_at": str(face_event.created_at),
                "image_path": face_event.image_path,
                "crop_image_path": face_event.crop_image_path,
                "original_image_path": face_event.original_image_path,
            }

            from app.db import SessionLocal
            def _fire(cfg=config, data=event_data):
                alert_db = SessionLocal()
                try:
                    dispatch_alert(cfg, data, alert_db)
                finally:
                    alert_db.close()

            t = threading.Thread(target=_fire, daemon=True)
            t.start()

    except Exception as e:
        logger.error("check_and_fire_alerts error: %s", e)
