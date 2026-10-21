import base64
import json
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app import licensing


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _configure(monkeypatch, tmp_path):
    private_key = Ed25519PrivateKey.generate()
    public_path = tmp_path / "public.pem"
    public_path.write_bytes(
        private_key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    monkeypatch.setenv("LICENSE_ENFORCEMENT", "1")
    monkeypatch.setenv("LICENSE_PUBLIC_KEY_FILE", str(public_path))
    monkeypatch.setenv("LICENSE_FILE", str(tmp_path / "license.json"))
    monkeypatch.setenv("LICENSE_INSTALLATION_ID_FILE", str(tmp_path / "installation_id"))
    licensing._load_public_key.cache_clear()
    return private_key


def _document(private_key, installation_id, modules, expires_at=None):
    payload = {
        "schema": 1,
        "license_id": "test-license",
        "customer": "Test Customer",
        "installation_id": installation_id,
        "modules": modules,
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "not_before": None,
        "expires_at": expires_at,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return {"payload": _b64(payload_bytes), "signature": _b64(private_key.sign(payload_bytes))}


def test_signed_license_enables_only_purchased_module(monkeypatch, tmp_path):
    private_key = _configure(monkeypatch, tmp_path)
    installation_id = licensing.get_installation_id()
    licensing.install_license(
        _document(private_key, installation_id, [licensing.MODULE_ACS])
    )

    status = licensing.license_status()
    assert status["valid"] is True
    assert status["modules"][licensing.MODULE_ACS]["licensed"] is True
    assert status["modules"][licensing.MODULE_FACE]["licensed"] is False


def test_license_rejects_wrong_installation_and_expiration(monkeypatch, tmp_path):
    private_key = _configure(monkeypatch, tmp_path)
    with pytest.raises(ValueError, match="another installation"):
        licensing.validate_license_document(
            _document(private_key, "wrong-installation", [licensing.MODULE_FACE])
        )

    expired = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    with pytest.raises(ValueError, match="expired"):
        licensing.validate_license_document(
            _document(private_key, licensing.get_installation_id(), [licensing.MODULE_FACE], expired)
        )


def test_tampered_license_is_rejected(monkeypatch, tmp_path):
    private_key = _configure(monkeypatch, tmp_path)
    document = _document(
        private_key,
        licensing.get_installation_id(),
        [licensing.MODULE_FACE],
    )
    payload = json.loads(base64.urlsafe_b64decode(document["payload"] + "=="))
    payload["modules"] = [licensing.MODULE_FACE, licensing.MODULE_ACS]
    document["payload"] = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())

    with pytest.raises(ValueError, match="signature"):
        licensing.validate_license_document(document)


def test_route_module_mapping():
    assert licensing.required_module_for_path("/api/acs/levels") == licensing.MODULE_ACS
    assert licensing.required_module_for_path("/api/attd/summary") == licensing.MODULE_ACS
    assert licensing.required_module_for_path("/api/events") == licensing.MODULE_FACE
    assert licensing.required_module_for_path("/api/license/status") is None
    assert licensing.required_module_for_path("/api/persons") == licensing.MODULE_ANY
