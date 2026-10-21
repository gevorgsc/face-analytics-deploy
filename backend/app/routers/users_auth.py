"""Users and legacy auth router - user CRUD, login, /me."""

import json
import logging

import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "0") == "1"  # set to 1 in HTTPS prod
_COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_admin,
    verify_password,
)
from app.auth_rate_limit import (
    check_login_rate_limit,
    register_login_failed,
    register_login_success,
)
from app.db import get_db
from app.models import User
from app.user_permissions import (
    USER_PERMISSION_GROUPS,
    normalize_permissions,
    permissions_json,
    permissions_to_role,
    user_permissions,
)
from app.utils import add_audit_log, diff_snapshot, model_snapshot, utc_now

logger = logging.getLogger(__name__)
router = APIRouter(tags=["users"])


def _validate_password(password: str) -> None:
    """Raise 400 if password doesn't meet minimum complexity requirements."""
    if len(password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    if not any(c.isupper() for c in password):
        raise HTTPException(400, "Password must contain at least one uppercase letter.")
    if not any(c.islower() for c in password):
        raise HTTPException(400, "Password must contain at least one lowercase letter.")
    if not any(c.isdigit() for c in password):
        raise HTTPException(400, "Password must contain at least one digit.")


@router.post("/api/legacy/auth/login")
async def login(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
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
        raise HTTPException(400, "Invalid request body. Expected JSON or form-data with username and password.")

    if not username or not password:
        raise HTTPException(400, "Username and password are required.")

    client_ip = request.client.host if request.client else "unknown"
    check_login_rate_limit(client_ip)

    user = db.query(User).filter(User.username == username).first()

    if not user or not verify_password(password, user.password_hash):
        remaining, blocked_until = register_login_failed(client_ip)

        add_audit_log(
            db=db, user=None, action="LOGIN_FAILED", target_type="user", target_id=username,
            details=f"Failed login for username: {username}. Remaining attempts: {remaining}",
            ip_address=client_ip,
        )

        if blocked_until:
            remaining_seconds = int((blocked_until - utc_now()).total_seconds())
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "Too many failed login attempts. IP temporarily blocked.",
                    "blocked": True,
                    "blocked_seconds": remaining_seconds,
                    "blocked_minutes": max(1, remaining_seconds // 60),
                },
            )

        raise HTTPException(
            status_code=401,
            detail={"message": "Wrong username or password", "remaining_attempts": remaining},
        )

    if not user.is_active:
        add_audit_log(
            db=db, user=user, action="LOGIN_FAILED", target_type="user", target_id=user.id,
            details="Login failed: user is inactive", ip_address=client_ip,
        )
        raise HTTPException(403, "User is inactive")

    register_login_success(client_ip)

    add_audit_log(
        db=db, user=user, action="LOGIN", target_type="user", target_id=user.id,
        details="User login successful", ip_address=client_ip,
    )

    token = create_access_token({
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
    })

    # Set httpOnly cookie so JS cannot read the token (XSS protection).
    # The JSON body still returns the token for backwards-compat with API clients.
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite=_COOKIE_SAMESITE,
        secure=_COOKIE_SECURE,
        max_age=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720")) * 60,
        path="/",
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "username": user.username, "role": user.role},
    }


@router.get("/api/legacy/auth/me")
def auth_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "is_active": current_user.is_active,
    }


@router.get("/api/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.id.desc()).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "permissions": user_permissions(getattr(u, "permissions", None), u.role),
            "is_active": u.is_active,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.post("/api/users")
def create_user(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    permissions = normalize_permissions(data.get("permissions"))
    role = permissions_to_role(permissions)

    if not username or not password:
        raise HTTPException(400, "Username and password required")

    _validate_password(password)

    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "Username already exists")

    user = User(
        username=username,
        password_hash=hash_password(password),
        role=role,
        permissions=permissions_json(permissions),
        is_active=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    add_audit_log(
        db, current_user, "USER_CREATED", "user", user.id,
        f"Created user: {user.username} / permissions: {permissions}",
        request.client.host if request.client else None,
    )

    return {"ok": True, "id": user.id}


@router.patch("/api/users/{user_id}")
def update_user(
    request: Request,
    user_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    before = model_snapshot(user, ["username", "role", "permissions", "is_active", "password_hash"])

    permissions = data.get("permissions")
    is_active = data.get("is_active")
    password = data.get("password")

    if permissions is not None:
        normalized = normalize_permissions(permissions)
        if user.role == "admin" and not set(USER_PERMISSION_GROUPS).issubset(set(normalized)):
            raise HTTPException(400, "Admin users must keep full access")
        user.permissions = permissions_json(normalized)
        user.role = permissions_to_role(normalized)

    if is_active is not None:
        user.is_active = 1 if bool(is_active) else 0

    if password:
        _validate_password(password)
        user.password_hash = hash_password(password)

    db.commit()
    db.refresh(user)

    after = model_snapshot(user, list(before.keys()))
    changes = diff_snapshot(before, after, redact={"password_hash"})
    add_audit_log(
        db, current_user, "USER_UPDATED", "user", user.id,
        json.dumps({"username": user.username, "changes": changes}, default=str),
        request.client.host if request.client else None,
    )

    return {"ok": True}


@router.delete("/api/users/{user_id}")
def delete_user(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(400, "You cannot delete yourself")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    deleted_username = user.username
    db.delete(user)
    db.commit()

    add_audit_log(
        db, current_user, "USER_DELETED", "user", user_id,
        f"Deleted user: {deleted_username}",
        request.client.host if request.client else None,
    )

    return {"ok": True}
