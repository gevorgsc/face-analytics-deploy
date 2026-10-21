"""Authentication router - login, refresh, logout, me."""

import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import os

from fastapi import APIRouter, Request, Response, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "0") == "1"
_COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")
_ACCESS_TTL = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")) * 60

if os.getenv("APP_ENV", "production") == "production" and not _COOKIE_SECURE:
    logging.getLogger(__name__).warning(
        "COOKIE_SECURE is 0 in production. Set COOKIE_SECURE=1 when serving over HTTPS."
    )


class _RefreshRequest(BaseModel):
    refresh_token: str


class _LogoutRequest(BaseModel):
    refresh_token: str = ""


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie("access_token", access_token, httponly=True,
                        samesite=_COOKIE_SAMESITE, secure=_COOKIE_SECURE,
                        max_age=_ACCESS_TTL, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True,
                        samesite=_COOKIE_SAMESITE, secure=_COOKIE_SECURE,
                        max_age=30 * 24 * 3600, path="/api/auth/refresh")


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth/refresh")

from app.db import get_db
from app.models import User, RefreshToken
from app.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, SECRET_KEY, ALGORITHM,
)
from app.auth_rate_limit import check_login_rate_limit, register_login_failed, register_login_success
from app.user_permissions import normalize_permissions, user_permissions
from app.utils import add_audit_log, utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_TOKEN_EXPIRE_DAYS = 30


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _create_refresh_token(db: Session, user: User) -> str:
    raw = secrets.token_urlsafe(48)
    token = RefreshToken(
        user_id=user.id,
        token_hash=_hash_token(raw),
        expires_at=utc_now() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        revoked=0,
    )
    db.add(token)
    db.commit()
    return raw


@router.post("/login")
async def login(request: Request, response: Response, db: Session = Depends(get_db)):
    username = ""
    password = ""
    content_type = (request.headers.get("content-type") or "").lower()
    try:
        if "application/json" in content_type:
            body = await request.json()
            username = (body.get("username") or "").strip()
            password = body.get("password") or ""
        elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
            form = await request.form()
            username = (form.get("username") or "").strip()
            password = form.get("password") or ""
        else:
            try:
                body = await request.json()
                username = (body.get("username") or "").strip()
                password = body.get("password") or ""
            except Exception:
                form = await request.form()
                username = (form.get("username") or "").strip()
                password = form.get("password") or ""
    except Exception:
        raise HTTPException(400, "Invalid request body")

    if not username or not password:
        raise HTTPException(400, "Username and password are required.")

    client_ip = request.client.host if request.client else "unknown"
    check_login_rate_limit(client_ip)

    user = db.query(User).filter(User.username == username).first()

    if not user or not verify_password(password, user.password_hash):
        remaining, blocked_until = register_login_failed(client_ip)
        add_audit_log(db, None, "LOGIN_FAILED", "user", username,
                      f"Failed login for {username}. Remaining: {remaining}", client_ip)
        if blocked_until:
            secs = int((blocked_until - utc_now()).total_seconds())
            raise HTTPException(429, {"message": "Too many failed login attempts.",
                                      "blocked": True, "blocked_seconds": secs})
        raise HTTPException(401, {"message": "Wrong username or password", "remaining_attempts": remaining})

    if not user.is_active:
        add_audit_log(db, user, "LOGIN_FAILED", "user", user.id, "User is inactive", client_ip)
        raise HTTPException(403, "User is inactive")

    register_login_success(client_ip)
    add_audit_log(db, user, "LOGIN", "user", user.id, "User login successful", client_ip)

    permissions = user_permissions(getattr(user, "permissions", None), user.role)
    access_token = create_access_token({"sub": str(user.id), "username": user.username, "role": user.role, "permissions": permissions})
    refresh_token = _create_refresh_token(db, user)

    _set_auth_cookies(response, access_token, refresh_token)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {"id": user.id, "username": user.username, "role": user.role, "permissions": permissions},
    }


@router.post("/refresh")
def refresh(
    request: Request,
    response: Response,
    body: Optional[_RefreshRequest] = None,
    db: Session = Depends(get_db),
):
    raw = ((body.refresh_token if body else "") or request.cookies.get("refresh_token", "")).strip()
    if not raw:
        raise HTTPException(400, "refresh_token required")

    token_hash = _hash_token(raw)
    token = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked == 0,
    ).with_for_update().first()

    if not token:
        raise HTTPException(401, "Invalid or expired refresh token")

    now = utc_now()
    expires = token.expires_at
    # Handle naive datetimes returned by some DB drivers
    if expires.tzinfo is None:
        from datetime import timezone as _tz
        expires = expires.replace(tzinfo=_tz.utc)
    if expires < now:
        token.revoked = 1
        db.commit()
        raise HTTPException(401, "Refresh token expired")

    user = db.get(User, token.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")

    # Rotate refresh token
    token.revoked = 1
    db.commit()
    new_refresh = _create_refresh_token(db, user)
    permissions = user_permissions(getattr(user, "permissions", None), user.role)
    access_token = create_access_token({"sub": str(user.id), "username": user.username, "role": user.role, "permissions": permissions})

    _set_auth_cookies(response, access_token, new_refresh)
    return {"access_token": access_token, "refresh_token": new_refresh, "token_type": "bearer"}


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    body: Optional[_LogoutRequest] = None,
    db: Session = Depends(get_db),
):
    raw = ((body.refresh_token if body else "") or request.cookies.get("refresh_token", "")).strip()
    current_user = None
    if raw:
        token_hash = _hash_token(raw)
        token = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
        if token:
            current_user = db.get(User, token.user_id)
            token.revoked = 1
            db.commit()

    _clear_auth_cookies(response)
    if current_user:
        client_ip = request.client.host if request.client else "unknown"
        add_audit_log(db, current_user, "LOGOUT", "user", current_user.id, "User logout", client_ip)
    return {"ok": True}


@router.get("/me")
def auth_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "permissions": user_permissions(getattr(current_user, "permissions", None), current_user.role),
        "is_active": current_user.is_active,
    }


@router.get("/sessions")
def list_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all active sessions (refresh tokens) for the current user."""
    now = utc_now()
    tokens = db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked == 0,
        RefreshToken.expires_at > now,
    ).order_by(RefreshToken.created_at.desc()).all()

    return [
        {
            "id": t.id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "expires_at": t.expires_at.isoformat() if t.expires_at else None,
        }
        for t in tokens
    ]


@router.delete("/sessions/{token_id}")
def revoke_session(token_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Revoke a specific session by refresh token id."""
    token = db.query(RefreshToken).filter(
        RefreshToken.id == token_id,
        RefreshToken.user_id == current_user.id,
    ).first()
    if not token:
        raise HTTPException(404, "Session not found")
    token.revoked = 1
    db.commit()
    return {"ok": True}


@router.delete("/sessions")
def revoke_all_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Revoke ALL active sessions (logout everywhere)."""
    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked == 0,
    ).update({"revoked": 1})
    db.commit()
    return {"ok": True}
