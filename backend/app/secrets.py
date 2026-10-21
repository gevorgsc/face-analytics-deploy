import base64
import os
from hashlib import sha256
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from app.env import load_app_env

load_app_env()

CAMERA_PASSWORD_PREFIX = "enc:"


def _fernet_from_env() -> Optional[Fernet]:
    raw_key = os.getenv("CAMERA_PASSWORD_KEY")
    if not raw_key:
        return None

    try:
        return Fernet(raw_key.encode("utf-8"))
    except Exception:
        derived = base64.urlsafe_b64encode(sha256(raw_key.encode("utf-8")).digest())
        return Fernet(derived)


def encrypt_camera_password(password: str) -> str:
    if not password:
        return ""

    fernet = _fernet_from_env()
    if not fernet or password.startswith(CAMERA_PASSWORD_PREFIX):
        return password

    encrypted = fernet.encrypt(password.encode("utf-8")).decode("utf-8")
    return f"{CAMERA_PASSWORD_PREFIX}{encrypted}"


def decrypt_camera_password(password: str) -> str:
    if not password:
        return ""

    if not password.startswith(CAMERA_PASSWORD_PREFIX):
        return password

    fernet = _fernet_from_env()
    if not fernet:
        return ""

    token = password[len(CAMERA_PASSWORD_PREFIX):]
    try:
        return fernet.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return ""
