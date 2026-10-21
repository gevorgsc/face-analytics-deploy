"""License status and activation endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user, require_admin
from app.licensing import activate_with_code, install_license, license_status
from app.models import User

router = APIRouter(prefix="/api/license", tags=["license"])


@router.get("/status")
def get_license_status(current_user: User = Depends(get_current_user)):
    del current_user
    return license_status()


@router.post("/activate")
def activate_license(document: dict, current_user: User = Depends(require_admin)):
    del current_user
    try:
        return install_license(document)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/activate-code")
def activate_license_code(data: dict, current_user: User = Depends(require_admin)):
    del current_user
    try:
        return activate_with_code(
            str(data.get("code") or ""),
            str(data.get("product_version") or "") or None,
        )
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
