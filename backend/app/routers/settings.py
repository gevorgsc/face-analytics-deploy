"""App settings router - occupancy max capacity and other runtime config."""
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import require_admin, get_current_user
from app.db import get_db
from app.models import AppSetting, User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["settings"])

_ALLOWED_KEYS = {
    "occupancy_max_capacity",
    "occupancy_alert_enabled",
    "face_quality_threshold",
    # Timezone displayed in the UI — IANA key, e.g. "Asia/Yerevan", "Europe/Moscow"
    "ui_timezone",
}

# Default timezone used throughout the application
DEFAULT_UI_TIMEZONE = "Asia/Yerevan"


def get_ui_timezone(db: Session) -> str:
    """Return the configured display timezone, falling back to Asia/Yerevan."""
    tz = _get(db, "ui_timezone", DEFAULT_UI_TIMEZONE)
    return tz or DEFAULT_UI_TIMEZONE


def _get(db: Session, key: str, default=None):
    row = db.get(AppSetting, key)
    return row.value if row else default


def _set(db: Session, key: str, value: str):
    row = db.get(AppSetting, key)
    if row:
        row.value = value
        row.updated_at = datetime.now(timezone.utc)
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()


@router.get("/api/settings")
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(AppSetting).all()
    result = {r.key: r.value for r in rows}
    # Always expose ui_timezone with a sensible default
    if "ui_timezone" not in result:
        result["ui_timezone"] = DEFAULT_UI_TIMEZONE
    return result


@router.put("/api/settings")
def update_settings(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    saved = {}
    for key, val in data.items():
        if key not in _ALLOWED_KEYS:
            continue
        _set(db, key, str(val))
        saved[key] = str(val)
    return {"ok": True, "saved": saved}


@router.get("/api/stats/occupancy")
def occupancy_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import FaceEvent
    from app.utils import yerevan_day_start_utc
    from sqlalchemy.orm import joinedload
    from datetime import timedelta

    max_capacity = int(_get(db, "occupancy_max_capacity", "0") or 0)
    alert_enabled = (_get(db, "occupancy_alert_enabled", "1") or "1") == "1"

    # Count currently inside using a DB-side subquery (avoids full table scan in memory)
    latest_sq = (
        db.query(
            FaceEvent.person_id,
            func.max(FaceEvent.created_at).label("max_ts"),
        )
        .filter(
            FaceEvent.source == "face_analytics",
            FaceEvent.direction.in_(["in", "out"]),
            FaceEvent.person_id.isnot(None),
        )
        .group_by(FaceEvent.person_id)
        .subquery()
    )
    currently_inside = (
        db.query(FaceEvent)
        .join(
            latest_sq,
            (FaceEvent.person_id == latest_sq.c.person_id)
            & (FaceEvent.created_at == latest_sq.c.max_ts),
        )
        .filter(
            FaceEvent.source == "face_analytics",
            FaceEvent.direction == "in",
        )
        .count()
    )

    today_start = yerevan_day_start_utc()
    today_end   = today_start + timedelta(hours=24)
    in_today  = db.query(FaceEvent).filter(
        FaceEvent.source == "face_analytics",
        FaceEvent.direction == "in",
        FaceEvent.created_at >= today_start,
        FaceEvent.created_at < today_end,
    ).count()
    out_today = db.query(FaceEvent).filter(
        FaceEvent.source == "face_analytics",
        FaceEvent.direction == "out",
        FaceEvent.created_at >= today_start,
        FaceEvent.created_at < today_end,
    ).count()

    pct = round(currently_inside / max_capacity * 100, 1) if max_capacity > 0 else None
    over = currently_inside > max_capacity if max_capacity > 0 else False

    return {
        "currently_inside":  currently_inside,
        "max_capacity":       max_capacity,
        "capacity_pct":       pct,
        "is_over_capacity":   over,
        "alert_enabled":      alert_enabled,
        "in_today":           in_today,
        "out_today":          out_today,
    }
