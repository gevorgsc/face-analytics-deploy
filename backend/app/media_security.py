import base64
import hashlib
import hmac
import os
import time
from urllib.parse import quote

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is missing. Add SECRET_KEY to your .env file.")

MEDIA_URL_TTL_SECONDS = int(os.getenv("MEDIA_URL_TTL_SECONDS", "900"))


def _sign_payload(payload: str) -> str:
    digest = hmac.new(SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def create_media_url(path: str | None, ttl_seconds: int | None = None) -> str | None:
    if not path:
        return path
    if path.startswith("http") or not path.startswith("/media/"):
        return path
    if "?exp=" in path and "&sig=" in path:
        return path

    exp = int(time.time()) + int(ttl_seconds or MEDIA_URL_TTL_SECONDS)
    payload = f"{path}.{exp}"
    sig = _sign_payload(payload)
    return f"{quote(path, safe='/')}?exp={exp}&sig={sig}"


def verify_media_signature(path: str, exp: int | None, sig: str | None) -> bool:
    if not exp or not sig:
        return False
    if exp < int(time.time()):
        return False
    expected = _sign_payload(f"{path}.{exp}")
    return hmac.compare_digest(expected, sig)
