"""Granular permissions router - camera-level and zone-level access control.

Adds fine-grained permission management on top of RBAC:
- Admins can grant specific users access to specific cameras
- Operators can be limited to certain zones/cameras
- Viewers can be restricted further
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.db import get_db, Base
from app.models import User, CameraDevice
from app.auth import require_admin, get_current_user
from app.utils import add_audit_log, utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/permissions", tags=["permissions"])


class UserCameraPermission(Base):
    """Per-user, per-camera permission override."""
    __tablename__ = "user_camera_permissions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    camera_id = Column(Integer, ForeignKey("camera_devices.id", ondelete="CASCADE"), nullable=False, index=True)
    can_view = Column(Integer, default=1)
    can_view_live = Column(Integer, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


@router.get("")
def list_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List all camera-level permission overrides."""
    try:
        rows = (
            db.query(UserCameraPermission, User, CameraDevice)
            .outerjoin(User, User.id == UserCameraPermission.user_id)
            .outerjoin(CameraDevice, CameraDevice.id == UserCameraPermission.camera_id)
            .all()
        )
    except Exception:
        return []

    return [
        {
            "id": perm.id,
            "user_id": perm.user_id,
            "username": user.username if user else "deleted",
            "camera_id": perm.camera_id,
            "camera_name": camera.name if camera else "deleted",
            "can_view": bool(perm.can_view),
            "can_view_live": bool(perm.can_view_live),
            "notes": perm.notes,
            "created_at": perm.created_at,
        }
        for perm, user, camera in rows
    ]


@router.get("/user/{user_id}")
def user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get all camera permissions for a specific user."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    try:
        rows = (
            db.query(UserCameraPermission, CameraDevice)
            .outerjoin(CameraDevice, CameraDevice.id == UserCameraPermission.camera_id)
            .filter(UserCameraPermission.user_id == user_id)
            .all()
        )
    except Exception:
        return {"user_id": user_id, "permissions": []}

    cameras_allowed = [
        {
            "camera_id": perm.camera_id,
            "camera_name": camera.name if camera else "deleted",
            "can_view": bool(perm.can_view),
            "can_view_live": bool(perm.can_view_live),
        }
        for perm, camera in rows
    ]

    return {"user_id": user_id, "username": user.username, "role": user.role, "camera_permissions": cameras_allowed}


@router.post("")
def grant_permission(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user_id = data.get("user_id")
    camera_id = data.get("camera_id")

    if not user_id or not camera_id:
        raise HTTPException(400, "user_id and camera_id required")

    user = db.get(User, user_id)
    camera = db.get(CameraDevice, camera_id)

    if not user:
        raise HTTPException(404, "User not found")
    if not camera:
        raise HTTPException(404, "Camera not found")

    try:
        existing = db.query(UserCameraPermission).filter(
            UserCameraPermission.user_id == user_id,
            UserCameraPermission.camera_id == camera_id,
        ).first()

        if existing:
            existing.can_view = 1 if data.get("can_view", True) else 0
            existing.can_view_live = 1 if data.get("can_view_live", False) else 0
            existing.notes = data.get("notes") or ""
        else:
            perm = UserCameraPermission(
                user_id=user_id,
                camera_id=camera_id,
                can_view=1 if data.get("can_view", True) else 0,
                can_view_live=1 if data.get("can_view_live", False) else 0,
                notes=data.get("notes") or "",
            )
            db.add(perm)

        db.commit()
    except Exception as e:
        logger.error("Permission save failed: %s", e)
        raise HTTPException(500, "Failed to save permissions")

    add_audit_log(db, current_user, "PERMISSION_GRANTED", "permission",
                  f"{user_id}:{camera_id}",
                  f"User {user.username} в†’ Camera {camera.name}",
                  request.client.host if request.client else None)
    return {"ok": True}


@router.delete("")
def revoke_permission(
    request: Request,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user_id = data.get("user_id")
    camera_id = data.get("camera_id")

    try:
        deleted = db.query(UserCameraPermission).filter(
            UserCameraPermission.user_id == user_id,
            UserCameraPermission.camera_id == camera_id,
        ).delete()
        db.commit()
    except Exception:
        deleted = 0

    if not deleted:
        raise HTTPException(404, "Permission not found")

    add_audit_log(db, current_user, "PERMISSION_REVOKED", "permission",
                  f"{user_id}:{camera_id}", None,
                  request.client.host if request.client else None)
    return {"ok": True}
