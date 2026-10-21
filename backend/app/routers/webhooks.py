"""Webhook management router - configure outbound webhook integrations."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User, WebhookConfig
from app.auth import require_admin
from app.utils import add_audit_log, utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

VALID_EVENT_TYPES = [
    "blacklist_detected", "vip_detected", "employee_detected",
    "unknown_detected", "low_quality", "all",
]


@router.get("")
def list_webhooks(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    webhooks = db.query(WebhookConfig).order_by(WebhookConfig.id).all()
    return [
        {
            "id": w.id,
            "name": w.name,
            "url": w.url,
            "is_active": w.is_active,
            "method": w.method,
            "event_types": json.loads(w.event_types or '["blacklist_detected"]'),
            "has_secret": bool(w.secret),
            "last_triggered_at": w.last_triggered_at,
            "last_status_code": w.last_status_code,
            "created_at": w.created_at,
        }
        for w in webhooks
    ]


@router.post("")
def create_webhook(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    name = (data.get("name") or "").strip()
    url = (data.get("url") or "").strip()

    if not name or not url:
        raise HTTPException(400, "name and url are required")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "URL must start with http:// or https://")

    event_types = data.get("event_types") or ["blacklist_detected"]
    for et in event_types:
        if et not in VALID_EVENT_TYPES:
            raise HTTPException(400, f"Invalid event_type: {et}. Valid: {VALID_EVENT_TYPES}")

    method = (data.get("method") or "POST").upper()
    if method not in {"POST", "PUT", "PATCH"}:
        raise HTTPException(400, "method must be POST, PUT, or PATCH")

    headers = data.get("headers") or {}
    if not isinstance(headers, dict):
        raise HTTPException(400, "headers must be a JSON object")

    webhook = WebhookConfig(
        name=name,
        url=url,
        secret=data.get("secret") or None,
        is_active=1 if data.get("is_active", True) else 0,
        event_types=json.dumps(event_types),
        method=method,
        headers=json.dumps(headers),
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)

    add_audit_log(db, current_user, "WEBHOOK_CREATED", "webhook", webhook.id, f"Created: {webhook.name}",
                  request.client.host if request.client else None)
    return {"ok": True, "id": webhook.id}


@router.patch("/{webhook_id}")
def update_webhook(
    request: Request,
    webhook_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    webhook = db.get(WebhookConfig, webhook_id)
    if not webhook:
        raise HTTPException(404, "Webhook not found")

    if "name" in data:
        webhook.name = (data["name"] or "").strip()
    if "url" in data:
        url = (data["url"] or "").strip()
        if url and not url.startswith(("http://", "https://")):
            raise HTTPException(400, "URL must start with http:// or https://")
        webhook.url = url
    if "is_active" in data:
        webhook.is_active = 1 if data["is_active"] else 0
    if "secret" in data:
        webhook.secret = data["secret"] or None
    if "event_types" in data:
        for et in (data["event_types"] or []):
            if et not in VALID_EVENT_TYPES:
                raise HTTPException(400, f"Invalid event_type: {et}. Valid: {VALID_EVENT_TYPES}")
        webhook.event_types = json.dumps(data["event_types"])
    if "method" in data:
        method = (data["method"] or "POST").upper()
        if method not in {"POST", "PUT", "PATCH"}:
            raise HTTPException(400, "method must be POST, PUT, or PATCH")
        webhook.method = method
    if "headers" in data:
        webhook.headers = json.dumps(data["headers"] or {})

    db.commit()
    add_audit_log(db, current_user, "WEBHOOK_UPDATED", "webhook", webhook_id, f"Updated: {webhook.name}",
                  request.client.host if request.client else None)
    return {"ok": True}


@router.delete("/{webhook_id}")
def delete_webhook(
    request: Request,
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    webhook = db.get(WebhookConfig, webhook_id)
    if not webhook:
        raise HTTPException(404, "Webhook not found")

    name = webhook.name
    db.delete(webhook)
    db.commit()

    add_audit_log(db, current_user, "WEBHOOK_DELETED", "webhook", webhook_id, f"Deleted: {name}",
                  request.client.host if request.client else None)
    return {"ok": True}


@router.post("/{webhook_id}/test")
def test_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Send a test payload to the webhook endpoint."""
    from app.webhook_engine import _deliver_webhook

    webhook = db.get(WebhookConfig, webhook_id)
    if not webhook:
        raise HTTPException(404, "Webhook not found")

    test_payload = {
        "event_type": "test",
        "message": "This is a test delivery from Face Analytics Pro",
        "webhook_name": webhook.name,
    }

    ok, status_code = _deliver_webhook(webhook, test_payload, db)
    return {
        "ok": ok,
        "status_code": status_code,
        "message": "Delivered successfully" if ok else f"Failed with status {status_code}",
    }
