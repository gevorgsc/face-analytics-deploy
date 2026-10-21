"""Offline, signed module licensing.

The application contains only the Ed25519 public key. License documents are
issued with a private key that must stay on the vendor's administration
machine and must never be deployed with the product.
"""

from __future__ import annotations

import base64
import json
import os
import tempfile
import time
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import urlparse

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import HTTPException

from app.env import BACKEND_DIR, load_app_env

load_app_env()

MODULE_FACE = "face_analytics"
MODULE_ACS = "access_controller"
MODULE_ANY = "licensed_module"
KNOWN_MODULES = {MODULE_FACE, MODULE_ACS}

_license_status_cache: dict[str, Any] | None = None
_license_status_cache_ts: float = 0.0
_LICENSE_STATUS_TTL = 60.0


def _invalidate_license_cache() -> None:
    global _license_status_cache, _license_status_cache_ts
    _license_status_cache = None
    _license_status_cache_ts = 0.0


def _path_from_env(name: str, default: str) -> Path:
    value = Path(os.getenv(name, default))
    return value if value.is_absolute() else BACKEND_DIR / value


def enforcement_enabled() -> bool:
    return os.getenv("LICENSE_ENFORCEMENT", "1").strip().lower() in {"1", "true", "yes", "on"}


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _license_path() -> Path:
    return _path_from_env("LICENSE_FILE", "runtime/license.json")


def _installation_id_path() -> Path:
    return _path_from_env("LICENSE_INSTALLATION_ID_FILE", "runtime/installation_id")


def _public_key_path() -> Path:
    return _path_from_env("LICENSE_PUBLIC_KEY_FILE", "license_public_key.pem")


def _activation_server_url() -> str:
    return os.getenv("LICENSE_SERVER_URL", "").strip().rstrip("/")


def activation_server_configured() -> bool:
    return bool(_activation_server_url())


def get_installation_id() -> str:
    path = _installation_id_path()
    if path.exists():
        value = path.read_text(encoding="utf-8").strip()
        if value:
            return value

    path.parent.mkdir(parents=True, exist_ok=True)
    value = str(uuid.uuid4())
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as tmp:
        tmp.write(value + "\n")
        temp_path = Path(tmp.name)
    os.replace(temp_path, path)
    return value


@lru_cache(maxsize=4)
def _load_public_key(path_text: str, modified_ns: int) -> Ed25519PublicKey:
    del modified_ns
    key = serialization.load_pem_public_key(Path(path_text).read_bytes())
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError("License public key must be an Ed25519 public key")
    return key


def _public_key() -> Ed25519PublicKey:
    path = _public_key_path()
    if not path.exists():
        raise ValueError(f"License public key not found: {path}")
    return _load_public_key(str(path), path.stat().st_mtime_ns)


def _parse_utc(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def validate_license_document(document: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(document, dict):
        raise ValueError("License document must be a JSON object")
    payload_text = document.get("payload")
    signature_text = document.get("signature")
    if not isinstance(payload_text, str) or not isinstance(signature_text, str):
        raise ValueError("License payload and signature are required")

    payload_bytes = _b64decode(payload_text)
    try:
        _public_key().verify(_b64decode(signature_text), payload_bytes)
    except InvalidSignature as exc:
        raise ValueError("License signature is invalid") from exc

    payload = json.loads(payload_bytes.decode("utf-8"))
    if payload.get("schema") != 1:
        raise ValueError("Unsupported license schema")
    if payload.get("installation_id") != get_installation_id():
        raise ValueError("License belongs to another installation")

    modules = payload.get("modules")
    if not isinstance(modules, list) or not modules:
        raise ValueError("License must contain at least one module")
    unknown = set(modules) - KNOWN_MODULES
    if unknown:
        raise ValueError(f"Unknown licensed modules: {', '.join(sorted(unknown))}")

    not_before = _parse_utc(payload.get("not_before"))
    expires_at = _parse_utc(payload.get("expires_at"))
    now = datetime.now(timezone.utc)
    if not_before and now < not_before:
        raise ValueError("License is not active yet")
    if expires_at and now >= expires_at:
        raise ValueError("License has expired")
    return payload


def load_license_document() -> dict[str, Any]:
    path = _license_path()
    if not path.exists():
        raise ValueError("License is not installed")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("License file is unreadable") from exc


def license_status() -> dict[str, Any]:
    global _license_status_cache, _license_status_cache_ts
    now_ts = time.monotonic()
    if _license_status_cache is not None and (now_ts - _license_status_cache_ts) < _LICENSE_STATUS_TTL:
        return _license_status_cache
    result = _compute_license_status()
    _license_status_cache = result
    _license_status_cache_ts = now_ts
    return result


def _compute_license_status() -> dict[str, Any]:
    installation_id = get_installation_id()
    if not enforcement_enabled():
        return {
            "enforcement_enabled": False,
            "online_activation_available": activation_server_configured(),
            "installation_id": installation_id,
            "valid": True,
            "customer": None,
            "license_id": None,
            "expires_at": None,
            "days_remaining": None,
            "expiring_soon": False,
            "error": None,
            "modules": {
                MODULE_FACE: {"licensed": True},
                MODULE_ACS: {"licensed": True},
            },
        }

    try:
        payload = validate_license_document(load_license_document())
        licensed = set(payload["modules"])
        expires_dt = _parse_utc(payload.get("expires_at"))
        now = datetime.now(timezone.utc)
        days_remaining = max(0, int((expires_dt - now).total_seconds() / 86400)) if expires_dt else None
        expiring_soon = days_remaining is not None and days_remaining <= 30
        return {
            "enforcement_enabled": True,
            "online_activation_available": activation_server_configured(),
            "installation_id": installation_id,
            "valid": True,
            "customer": payload.get("customer"),
            "license_id": payload.get("license_id"),
            "expires_at": payload.get("expires_at"),
            "days_remaining": days_remaining,
            "expiring_soon": expiring_soon,
            "error": None,
            "modules": {
                MODULE_FACE: {"licensed": MODULE_FACE in licensed},
                MODULE_ACS: {"licensed": MODULE_ACS in licensed},
            },
        }
    except (ValueError, OSError) as exc:
        return {
            "enforcement_enabled": True,
            "online_activation_available": activation_server_configured(),
            "installation_id": installation_id,
            "valid": False,
            "customer": None,
            "license_id": None,
            "expires_at": None,
            "days_remaining": None,
            "expiring_soon": False,
            "error": str(exc),
            "modules": {
                MODULE_FACE: {"licensed": False},
                MODULE_ACS: {"licensed": False},
            },
        }


def install_license(document: dict[str, Any]) -> dict[str, Any]:
    validate_license_document(document)
    path = _license_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(document, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as tmp:
        tmp.write(serialized)
        temp_path = Path(tmp.name)
    os.replace(temp_path, path)
    _invalidate_license_cache()
    return license_status()


def activate_with_code(code: str, product_version: str | None = None) -> dict[str, Any]:
    server_url = _activation_server_url()
    if not server_url:
        raise ValueError("Online activation server is not configured")
    parsed = urlparse(server_url)
    allow_http = os.getenv("LICENSE_SERVER_ALLOW_HTTP", "0").strip().lower() in {"1", "true", "yes", "on"}
    if parsed.scheme != "https" and not (
        allow_http and parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
    ):
        raise ValueError("License server must use HTTPS")

    normalized_code = code.strip().upper()
    if len(normalized_code) < 8:
        raise ValueError("Activation code is required")
    body = json.dumps(
        {
            "code": normalized_code,
            "installation_id": get_installation_id(),
            "product_version": product_version,
        }
    ).encode("utf-8")
    req = urlrequest.Request(
        f"{server_url}/activate",
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "GSC-License-Client/1.0"},
        method="POST",
    )
    timeout = max(3, min(int(os.getenv("LICENSE_SERVER_TIMEOUT_SECONDS", "15")), 60))
    try:
        with urlrequest.urlopen(req, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urlerror.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("detail")
        except Exception:
            detail = None
        raise ValueError(str(detail or f"Activation server rejected the request ({exc.code})")) from exc
    except (urlerror.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ValueError("Could not connect to the activation server") from exc

    document = result.get("license")
    if not isinstance(document, dict):
        raise ValueError("Activation server returned an invalid response")
    return install_license(document)


def module_is_licensed(module: str) -> bool:
    if module == MODULE_ANY:
        status = license_status()
        return any(status["modules"][name]["licensed"] for name in KNOWN_MODULES)
    if module not in KNOWN_MODULES:
        return False
    return bool(license_status()["modules"][module]["licensed"])


def require_module_license(module: str) -> None:
    status = license_status()
    if module == MODULE_ANY:
        licensed = any(status["modules"][name]["licensed"] for name in KNOWN_MODULES)
    elif module not in KNOWN_MODULES:
        licensed = False
    else:
        licensed = bool(status["modules"][module]["licensed"])
    if licensed:
        return
    raise HTTPException(
        status_code=402,
        detail={
            "code": "LICENSE_REQUIRED",
            "module": module,
            "message": f"A valid {module} license is required",
            "license_error": status.get("error"),
        },
    )


def required_module_for_path(path: str) -> str | None:
    exempt_prefixes = (
        "/api/auth",
        "/api/legacy/auth",
        "/api/license",
        "/api/csrf-token",
        "/api/visitor-kiosk",
    )
    acs_prefixes = ("/api/acs", "/api/attd", "/api/doors")
    face_prefixes = (
        "/api/cameras",
        "/api/events",
        "/api/analytics",
        "/api/maps",
        "/api/zones",
        "/api/alerts",
        "/api/webrtc",
        "/api/alarm/hikvision",
        "/api/search",
        "/api/unknowns",
        "/api/stats",
        "/api/test/upload",
    )
    # Routes shared between modules — require any valid license
    shared_prefixes = (
        "/api/persons",
        "/api/exports",
        "/api/reports",
        "/api/webhooks",
        "/api/permissions",
        "/api/ldap",
    )
    if path.startswith(exempt_prefixes):
        return None
    if path.startswith(acs_prefixes):
        return MODULE_ACS
    if path.startswith(face_prefixes):
        return MODULE_FACE
    if path.startswith(shared_prefixes):
        return MODULE_ANY
    if path.startswith("/api/"):
        return MODULE_ANY
    return None
