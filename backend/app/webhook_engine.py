"""Outbound webhook engine - push events to third-party systems."""

import ipaddress
import json
import hmac
import hashlib
import logging
import threading
from urllib.parse import urlparse
from urllib.request import urlopen, Request as UrlRequest
from urllib.error import URLError

logger = logging.getLogger(__name__)

_ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


def _is_safe_url(url: str) -> bool:
    """Return False if URL scheme is not http/https or resolves to a private/loopback address."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        host = parsed.hostname or ""
        try:
            addr = ipaddress.ip_address(host)
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
                return False
        except ValueError:
            pass  # hostname — allow
        return True
    except Exception:
        return False


def _deliver_webhook(config, payload: dict, db=None) -> tuple[bool, int | None]:
    """Deliver a payload to a webhook endpoint. Returns (success, status_code)."""
    try:
        url = config.url
        if not url:
            return False, None

        if not _is_safe_url(url):
            logger.warning("Webhook %s blocked: unsafe URL %s", config.name, url)
            return False, None

        data = json.dumps(payload).encode("utf-8")

        headers = {"Content-Type": "application/json", "User-Agent": "FaceAnalyticsPro/1.0"}

        extra_headers_raw = config.headers or "{}"
        try:
            extra = json.loads(extra_headers_raw) if isinstance(extra_headers_raw, str) else extra_headers_raw
            headers.update(extra)
        except Exception:
            pass

        if config.secret:
            sig = hmac.new(config.secret.encode(), data, hashlib.sha256).hexdigest()
            headers["X-Signature-SHA256"] = f"sha256={sig}"

        method = (config.method or "POST").upper()
        if method not in _ALLOWED_METHODS:
            method = "POST"
        req = UrlRequest(url, data=data, headers=headers, method=method)

        with urlopen(req, timeout=10) as resp:
            status = resp.status
            ok = status < 400
            if db:
                try:
                    from app.utils import utc_now
                    config_fresh = db.get(type(config), config.id)
                    if config_fresh:
                        config_fresh.last_triggered_at = utc_now()
                        config_fresh.last_status_code = status
                        db.commit()
                except Exception:
                    pass
            return ok, status

    except URLError as e:
        logger.warning("Webhook delivery failed for %s: %s", config.url, e)
        return False, None
    except Exception as e:
        logger.error("Webhook engine error: %s", e)
        return False, None


def dispatch_webhooks(db, event_type: str, payload: dict) -> None:
    """Find active webhooks that subscribe to event_type and deliver async."""
    try:
        from app.models import WebhookConfig

        configs = db.query(WebhookConfig).filter(WebhookConfig.is_active == 1).all()
        matching = []
        for c in configs:
            try:
                event_types = json.loads(c.event_types or '["blacklist_detected"]')
            except Exception:
                event_types = ["blacklist_detected"]
            if "all" in event_types or event_type in event_types:
                matching.append(c)

        for config in matching:
            from app.db import SessionLocal
            def _fire(cfg=config, p=payload):
                wh_db = SessionLocal()
                try:
                    ok, code = _deliver_webhook(cfg, p, wh_db)
                    level = logging.INFO if ok else logging.WARNING
                    logger.log(level, "Webhook %s в†’ %s status=%s", cfg.name, cfg.url, code)
                finally:
                    wh_db.close()

            t = threading.Thread(target=_fire, daemon=True)
            t.start()

    except Exception as e:
        logger.error("dispatch_webhooks error: %s", e)
