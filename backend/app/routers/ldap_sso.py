"""LDAP / Active Directory SSO configuration and login router."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User, LdapConfig
from app.auth import require_admin, create_access_token
from app.utils import add_audit_log, utc_now
from app.secrets import encrypt_camera_password, decrypt_camera_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ldap", tags=["ldap"])


def _get_ldap_config(db: Session) -> LdapConfig | None:
    return db.query(LdapConfig).first()


@router.get("/config")
def get_ldap_config(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    config = _get_ldap_config(db)
    if not config:
        return {"configured": False}
    return {
        "configured": True,
        "id": config.id,
        "is_active": config.is_active,
        "server_url": config.server_url,
        "bind_dn": config.bind_dn,
        "has_bind_password": bool(config.bind_password),
        "base_dn": config.base_dn,
        "user_search_filter": config.user_search_filter,
        "default_role": config.default_role,
        "admin_groups": json.loads(config.admin_groups or "[]"),
        "operator_groups": json.loads(config.operator_groups or "[]"),
    }


@router.put("/config")
def save_ldap_config(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    config = _get_ldap_config(db)
    if not config:
        config = LdapConfig(server_url="ldap://localhost:389", base_dn="dc=example,dc=com")
        db.add(config)

    config.is_active = 1 if data.get("is_active", False) else 0
    config.server_url = (data.get("server_url") or "ldap://localhost:389").strip()
    config.bind_dn = (data.get("bind_dn") or "").strip() or None
    config.base_dn = (data.get("base_dn") or "dc=example,dc=com").strip()
    config.user_search_filter = (data.get("user_search_filter") or "(sAMAccountName={username})").strip()
    config.default_role = (data.get("default_role") or "viewer").lower()
    config.admin_groups = json.dumps(data.get("admin_groups") or [])
    config.operator_groups = json.dumps(data.get("operator_groups") or [])
    config.updated_at = utc_now()

    if data.get("bind_password"):
        config.bind_password = encrypt_camera_password(data["bind_password"])

    db.commit()
    add_audit_log(db, current_user, "LDAP_CONFIG_UPDATED", "ldap", config.id, "LDAP config updated",
                  request.client.host if request.client else None)
    return {"ok": True}


@router.post("/test-connection")
def test_ldap_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    from app.ldap_client import test_ldap_connection as _test

    config = _get_ldap_config(db)
    if not config:
        raise HTTPException(404, "LDAP not configured")

    bind_password = decrypt_camera_password(config.bind_password) if config.bind_password else None
    result = _test(config.server_url, config.bind_dn, bind_password)
    return result


@router.post("/login")
async def ldap_login(request: Request, db: Session = Depends(get_db)):
    """Login endpoint that authenticates via LDAP, creates/updates local User record."""
    from app.ldap_client import ldap_authenticate
    from app.routers.auth import _create_refresh_token

    config = _get_ldap_config(db)
    if not config or not config.is_active:
        raise HTTPException(400, "LDAP SSO is not enabled")

    content_type = (request.headers.get("content-type") or "").lower()
    try:
        if "application/json" in content_type:
            body = await request.json()
            username = (body.get("username") or "").strip()
            password = body.get("password") or ""
        else:
            form = await request.form()
            username = (form.get("username") or "").strip()
            password = form.get("password") or ""
    except Exception:
        raise HTTPException(400, "Invalid request body")

    if not username or not password:
        raise HTTPException(400, "Username and password are required")

    client_ip = request.client.host if request.client else "unknown"

    bind_password = decrypt_camera_password(config.bind_password) if config.bind_password else None
    ldap_user = ldap_authenticate(
        server_url=config.server_url,
        bind_dn=config.bind_dn,
        bind_password=bind_password,
        base_dn=config.base_dn,
        search_filter=config.user_search_filter,
        username=username,
        password=password,
        admin_groups=json.loads(config.admin_groups or "[]"),
        operator_groups=json.loads(config.operator_groups or "[]"),
        default_role=config.default_role,
    )

    if not ldap_user:
        add_audit_log(db, None, "LDAP_LOGIN_FAILED", "user", username, "LDAP auth failed", client_ip)
        raise HTTPException(401, "LDAP authentication failed")

    # Upsert local user
    user = db.query(User).filter(User.username == username).first()
    if not user:
        from app.auth import hash_password
        import secrets
        user = User(
            username=username,
            password_hash=hash_password(secrets.token_urlsafe(32)),  # dummy, LDAP handles auth
            role=ldap_user["role"],
            is_active=1,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Created local user from LDAP: %s role=%s", username, ldap_user["role"])
    else:
        user.role = ldap_user["role"]
        user.is_active = 1
        db.commit()

    add_audit_log(db, user, "LDAP_LOGIN", "user", user.id, f"LDAP login successful. Role: {user.role}", client_ip)

    access_token = create_access_token({"sub": str(user.id), "username": user.username, "role": user.role})
    refresh_token = _create_refresh_token(db, user)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {"id": user.id, "username": user.username, "role": user.role},
    }
