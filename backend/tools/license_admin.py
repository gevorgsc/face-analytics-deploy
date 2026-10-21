"""Vendor-side utility for generating keys and issuing offline licenses."""

from __future__ import annotations

import argparse
import base64
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

KNOWN_MODULES = {"face_analytics", "access_controller"}


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def generate_keys(private_path: Path, public_path: Path) -> None:
    if private_path.exists() or public_path.exists():
        raise SystemExit("Refusing to overwrite an existing key")
    private_path.parent.mkdir(parents=True, exist_ok=True)
    public_path.parent.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    private_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    public_path.write_bytes(
        key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    print(f"Private issuer key: {private_path}")
    print(f"Public application key: {public_path}")


def create_license_document(
    private_key_path: Path,
    installation_id: str,
    customer: str,
    modules: Iterable[str],
    expires_at: str | None = None,
    not_before: str | None = None,
    license_id: str | None = None,
) -> dict:
    modules = sorted(set(modules))
    unknown = set(modules) - KNOWN_MODULES
    if unknown:
        raise ValueError(f"Unknown modules: {', '.join(sorted(unknown))}")
    if not modules:
        raise ValueError("Select at least one module")
    if not customer.strip():
        raise ValueError("Customer name is required")
    try:
        uuid.UUID(installation_id)
    except ValueError as exc:
        raise ValueError("Installation ID must be a valid UUID") from exc

    key = serialization.load_pem_private_key(private_key_path.read_bytes(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("Private key must be Ed25519")

    payload = {
        "schema": 1,
        "license_id": license_id or str(uuid.uuid4()),
        "customer": customer.strip(),
        "installation_id": installation_id,
        "modules": modules,
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "not_before": not_before,
        "expires_at": expires_at,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return {
        "payload": _b64encode(payload_bytes),
        "signature": _b64encode(key.sign(payload_bytes)),
    }


def issue_license(args: argparse.Namespace) -> None:
    document = create_license_document(
        private_key_path=args.private_key,
        installation_id=args.installation_id,
        customer=args.customer,
        modules=args.modules,
        expires_at=args.expires_at,
        not_before=args.not_before,
        license_id=args.license_id,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(f"License issued: {args.output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    keygen = sub.add_parser("keygen")
    keygen.add_argument("--private-key", type=Path, required=True)
    keygen.add_argument("--public-key", type=Path, required=True)

    issue = sub.add_parser("issue")
    issue.add_argument("--private-key", type=Path, required=True)
    issue.add_argument("--installation-id", required=True)
    issue.add_argument("--customer", required=True)
    issue.add_argument("--modules", nargs="+", required=True, choices=sorted(KNOWN_MODULES))
    issue.add_argument("--expires-at", help="ISO-8601 UTC timestamp; omit for perpetual")
    issue.add_argument("--not-before", help="ISO-8601 UTC timestamp")
    issue.add_argument("--license-id")
    issue.add_argument("--output", type=Path, required=True)

    args = parser.parse_args()
    if args.command == "keygen":
        generate_keys(args.private_key, args.public_key)
    else:
        issue_license(args)


if __name__ == "__main__":
    main()
