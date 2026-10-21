"""GSC hybrid license activation server.

Run this service on a private HTTPS server. It owns the issuer private key and
exchanges short activation codes for installation-bound signed licenses.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sqlite3
import uuid
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

MODULES = {"face_analytics", "access_controller"}
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("ACTIVATION_DB", str(BASE_DIR / "data" / "activation.db")))
PRIVATE_KEY_PATH = Path(
    os.getenv("LICENSE_PRIVATE_KEY_FILE", str(Path.home() / ".gsc-license-issuer" / "private_key.pem"))
)
ADMIN_TOKEN = os.getenv("ACTIVATION_ADMIN_TOKEN", "")
CODE_PEPPER = os.getenv("ACTIVATION_CODE_PEPPER", "")

class CodeCreate(BaseModel):
    customer: str = Field(min_length=1, max_length=200)
    modules: list[str]
    expires_at: str | None = None
    max_activations: int = Field(default=1, ge=1, le=1000)
    notes: str | None = Field(default=None, max_length=1000)


class ActivationRequest(BaseModel):
    code: str = Field(min_length=8, max_length=40)
    installation_id: str
    product_version: str | None = Field(default=None, max_length=50)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def normalize_code(value: str) -> str:
    cleaned = "".join(ch for ch in value.upper() if ch.isalnum())
    if cleaned.startswith("GSC"):
        cleaned = cleaned[3:]
    return cleaned


def code_hash(value: str) -> str:
    return hashlib.sha256(f"{CODE_PEPPER}:{normalize_code(value)}".encode()).hexdigest()


def display_code(raw: str) -> str:
    return "GSC-" + "-".join(raw[index:index + 4] for index in range(0, len(raw), 4))


@contextmanager
def database() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def initialize_database() -> None:
    with database() as db:
        db.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS activation_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code_hash TEXT NOT NULL UNIQUE,
                code_hint TEXT NOT NULL,
                customer TEXT NOT NULL,
                modules_json TEXT NOT NULL,
                expires_at TEXT,
                max_activations INTEGER NOT NULL DEFAULT 1,
                activation_count INTEGER NOT NULL DEFAULT 0,
                revoked INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS activations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code_id INTEGER NOT NULL,
                installation_id TEXT NOT NULL,
                license_id TEXT NOT NULL,
                product_version TEXT,
                client_ip TEXT,
                activated_at TEXT NOT NULL,
                UNIQUE(code_id, installation_id),
                FOREIGN KEY(code_id) REFERENCES activation_codes(id)
            );
            """
        )


def require_admin(authorization: str | None = Header(default=None)) -> None:
    if not ADMIN_TOKEN or not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Admin authorization required")
    if not secrets.compare_digest(authorization[7:], ADMIN_TOKEN):
        raise HTTPException(403, "Invalid admin token")


def validate_expiry(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(400, "expires_at must be ISO-8601") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if parsed.astimezone(timezone.utc) <= utc_now():
        raise HTTPException(400, "expires_at must be in the future")
    return parsed.astimezone(timezone.utc).isoformat()


def private_key() -> Ed25519PrivateKey:
    if not PRIVATE_KEY_PATH.exists():
        raise HTTPException(503, "Issuer private key is unavailable")
    key = serialization.load_pem_private_key(PRIVATE_KEY_PATH.read_bytes(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise HTTPException(503, "Issuer key is not Ed25519")
    return key


def b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def create_license(row: sqlite3.Row, installation_id: str) -> dict:
    license_id = str(uuid.uuid4())
    payload = {
        "schema": 1,
        "license_id": license_id,
        "customer": row["customer"],
        "installation_id": installation_id,
        "modules": json.loads(row["modules_json"]),
        "issued_at": iso_now(),
        "not_before": None,
        "expires_at": row["expires_at"],
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return {
        "license_id": license_id,
        "document": {
            "payload": b64(payload_bytes),
            "signature": b64(private_key().sign(payload_bytes)),
        },
    }


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not ADMIN_TOKEN or len(ADMIN_TOKEN) < 32:
        raise RuntimeError("ACTIVATION_ADMIN_TOKEN must contain at least 32 characters")
    if not CODE_PEPPER or len(CODE_PEPPER) < 32:
        raise RuntimeError("ACTIVATION_CODE_PEPPER must contain at least 32 characters")
    initialize_database()
    yield


app = FastAPI(
    title="GSC License Activation Server",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/admin/codes", dependencies=[Depends(require_admin)])
def create_code(data: CodeCreate):
    modules = sorted(set(data.modules))
    if not modules or set(modules) - MODULES:
        raise HTTPException(400, "Select valid licensed modules")
    expires_at = validate_expiry(data.expires_at)

    for _ in range(5):
        raw = secrets.token_hex(10).upper()
        shown = display_code(raw)
        try:
            with database() as db:
                cursor = db.execute(
                    """
                    INSERT INTO activation_codes
                    (code_hash, code_hint, customer, modules_json, expires_at,
                     max_activations, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        code_hash(shown),
                        shown[-4:],
                        data.customer.strip(),
                        json.dumps(modules),
                        expires_at,
                        data.max_activations,
                        data.notes,
                        iso_now(),
                    ),
                )
                code_id = cursor.lastrowid
            return {
                "id": code_id,
                "activation_code": shown,
                "customer": data.customer.strip(),
                "modules": modules,
                "expires_at": expires_at,
                "max_activations": data.max_activations,
            }
        except sqlite3.IntegrityError:
            continue
    raise HTTPException(500, "Could not allocate an activation code")


@app.get("/admin/codes", dependencies=[Depends(require_admin)])
def list_codes():
    with database() as db:
        rows = db.execute(
            """
            SELECT id, code_hint, customer, modules_json, expires_at,
                   max_activations, activation_count, revoked, notes, created_at
            FROM activation_codes ORDER BY id DESC
            """
        ).fetchall()
    return [
        {
            **dict(row),
            "modules": json.loads(row["modules_json"]),
            "modules_json": None,
        }
        for row in rows
    ]


@app.post("/admin/codes/{code_id}/revoke", dependencies=[Depends(require_admin)])
def revoke_code(code_id: int):
    with database() as db:
        changed = db.execute(
            "UPDATE activation_codes SET revoked = 1 WHERE id = ?",
            (code_id,),
        ).rowcount
    if not changed:
        raise HTTPException(404, "Activation code not found")
    return {"ok": True}


@app.post("/activate")
def activate(data: ActivationRequest, request: Request):
    try:
        installation_id = str(uuid.UUID(data.installation_id))
    except ValueError as exc:
        raise HTTPException(400, "Invalid installation ID") from exc

    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT * FROM activation_codes WHERE code_hash = ?",
            (code_hash(data.code),),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Activation code is invalid")
        if row["revoked"]:
            raise HTTPException(403, "Activation code has been revoked")
        if row["expires_at"] and datetime.fromisoformat(row["expires_at"]) <= utc_now():
            raise HTTPException(403, "Activation code has expired")

        existing = db.execute(
            "SELECT license_id FROM activations WHERE code_id = ? AND installation_id = ?",
            (row["id"], installation_id),
        ).fetchone()
        if not existing and row["activation_count"] >= row["max_activations"]:
            raise HTTPException(409, "Activation limit has been reached")

        result = create_license(row, installation_id)
        if not existing:
            db.execute(
                """
                INSERT INTO activations
                (code_id, installation_id, license_id, product_version, client_ip, activated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"],
                    installation_id,
                    result["license_id"],
                    data.product_version,
                    request.client.host if request.client else None,
                    iso_now(),
                ),
            )
            db.execute(
                "UPDATE activation_codes SET activation_count = activation_count + 1 WHERE id = ?",
                (row["id"],),
            )

    return {"license": result["document"]}
