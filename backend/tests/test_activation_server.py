import importlib
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from app import licensing


@pytest.mark.skipif(
    importlib.util.find_spec("license_server") is None,
    reason="license_server package not present in this installation",
)
def test_activation_code_issues_installation_bound_signed_license(monkeypatch, tmp_path):
    private_key = Ed25519PrivateKey.generate()
    private_path = tmp_path / "private.pem"
    public_path = tmp_path / "public.pem"
    private_path.write_bytes(
        private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    public_path.write_bytes(
        private_key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )

    monkeypatch.setenv("ACTIVATION_ADMIN_TOKEN", "a" * 64)
    monkeypatch.setenv("ACTIVATION_CODE_PEPPER", "b" * 64)
    monkeypatch.setenv("LICENSE_PRIVATE_KEY_FILE", str(private_path))
    monkeypatch.setenv("ACTIVATION_DB", str(tmp_path / "activation.db"))

    import license_server.app as activation_app

    activation_app = importlib.reload(activation_app)
    with TestClient(activation_app.app) as client:
        created = client.post(
            "/admin/codes",
            headers={"Authorization": f"Bearer {'a' * 64}"},
            json={
                "customer": "Integration Test",
                "modules": ["access_controller"],
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                "max_activations": 1,
            },
        )
        assert created.status_code == 200
        code = created.json()["activation_code"]

        installation_id = "d6ceff96-8a49-44f2-b6eb-31d29a176c31"
        activated = client.post(
            "/activate",
            json={"code": code, "installation_id": installation_id, "product_version": "test"},
        )
        assert activated.status_code == 200

        second_installation = client.post(
            "/activate",
            json={"code": code, "installation_id": "fa035ce7-3656-4234-a44b-d1b1920396bb"},
        )
        assert second_installation.status_code == 409

    monkeypatch.setenv("LICENSE_PUBLIC_KEY_FILE", str(public_path))
    monkeypatch.setenv("LICENSE_INSTALLATION_ID_FILE", str(tmp_path / "installation_id"))
    (tmp_path / "installation_id").write_text(installation_id, encoding="utf-8")
    licensing._load_public_key.cache_clear()
    payload = licensing.validate_license_document(activated.json()["license"])
    assert payload["customer"] == "Integration Test"
    assert payload["modules"] == ["access_controller"]
