"""
csrf_middleware.py - CSRF protection for state-changing API requests.

Uses double-submit cookie pattern:
  1. On any GET /api/csrf-token → server issues a signed CSRF token in a cookie + returns it in body.
  2. On POST/PATCH/DELETE requests the client must include it via X-CSRF-Token header.
  3. Middleware compares header value to cookie value (HMAC-verified).

Routes that use Bearer-only auth (JWT in Authorization header) are exempt because
cross-site requests cannot read Authorization headers from a foreign origin.
We still protect cookie-based sessions or form posts.
"""

import hashlib
import hmac
import os
import secrets
import time

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

_CSRF_SECRET = os.getenv("CSRF_SECRET") or os.getenv("SECRET_KEY")
if not _CSRF_SECRET:
    raise RuntimeError("CSRF protection requires CSRF_SECRET or SECRET_KEY")
_CSRF_COOKIE = "csrf_token"
_CSRF_HEADER = "X-CSRF-Token"
_TOKEN_TTL = 3600  # 1 hour

# Paths that skip CSRF check (webhook receivers, health, auth endpoints)
_EXEMPT_PREFIXES = (
    "/health", "/ready", "/ws", "/api/alarm",
    "/api/legacy/auth", "/api/auth",
    "/api/visitor-kiosk",
    "/api/metrics", "/docs", "/redoc", "/openapi.json",
)
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _sign(value: str) -> str:
    return hmac.new(_CSRF_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()


def _make_token() -> str:
    raw = secrets.token_hex(24)
    ts = str(int(time.time()))
    sig = _sign(f"{raw}:{ts}")
    return f"{raw}:{ts}:{sig}"


def _verify_token(token: str) -> bool:
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return False
        raw, ts, sig = parts
        if int(time.time()) - int(ts) > _TOKEN_TTL:
            return False
        expected = _sign(f"{raw}:{ts}")
        return hmac.compare_digest(expected, sig)
    except Exception:
        return False


class CSRFMiddleware(BaseHTTPMiddleware):
    """Validate CSRF token on state-changing requests."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip safe methods and exempt paths
        if request.method in _SAFE_METHODS:
            return await call_next(request)
        if any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            return await call_next(request)

        # Requests using Bearer token auth are not vulnerable to CSRF
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return await call_next(request)

        # For cookie-authenticated requests, enforce CSRF header
        csrf_header = request.headers.get(_CSRF_HEADER, "")
        csrf_cookie = request.cookies.get(_CSRF_COOKIE, "")

        if not csrf_header or not csrf_cookie:
            return JSONResponse(
                {"detail": "CSRF token missing"},
                status_code=403,
            )

        if csrf_header != csrf_cookie or not _verify_token(csrf_header):
            return JSONResponse(
                {"detail": "CSRF token invalid"},
                status_code=403,
            )

        return await call_next(request)


def new_csrf_token() -> str:
    return _make_token()
