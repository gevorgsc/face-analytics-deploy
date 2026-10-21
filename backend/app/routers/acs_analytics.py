"""
acs_analytics.py — Access Control analytics endpoints.

Provides:
  - Hourly access heatmap
  - Per-door access counts
  - Peak hours analysis
  - Person access frequency
  - Denial rate stats
  - Offline cache management
  - CSV/Excel bulk export
"""

import csv
import io
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.models import (
    AcsAccessEvent, AcsDenialLog, AccessControlDevice, AcsOfflineCard, Person, User,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/acs/analytics", tags=["acs_analytics"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Summary stats ──────────────────────────────────────────────────────────────

@router.get("/summary")
def analytics_summary(
    hours: int = Query(24, ge=1, le=720),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cutoff = _utcnow() - timedelta(hours=hours)
    total   = db.query(AcsAccessEvent).filter(AcsAccessEvent.created_at >= cutoff).count()
    granted = db.query(AcsAccessEvent).filter(
        AcsAccessEvent.created_at >= cutoff,
        AcsAccessEvent.event_type == "access_granted",
    ).count()
    denied  = db.query(AcsAccessEvent).filter(
        AcsAccessEvent.created_at >= cutoff,
        AcsAccessEvent.event_type == "access_denied",
    ).count()
    unique_persons = (
        db.query(func.count(func.distinct(AcsAccessEvent.person_id)))
        .filter(
            AcsAccessEvent.created_at >= cutoff,
            AcsAccessEvent.person_id != None,
        )
        .scalar() or 0
    )
    denial_rate = round(denied / total * 100, 1) if total > 0 else 0.0

    return {
        "period_hours":   hours,
        "total_events":   total,
        "granted":        granted,
        "denied":         denied,
        "unique_persons": unique_persons,
        "denial_rate_pct": denial_rate,
    }


# ── Hourly heatmap ─────────────────────────────────────────────────────────────

@router.get("/hourly")
def hourly_heatmap(
    days: int = Query(7, ge=1, le=90),
    device_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns event counts per hour-of-day (0-23) for granted access."""
    cutoff = _utcnow() - timedelta(days=days)
    q = db.query(AcsAccessEvent).filter(
        AcsAccessEvent.created_at >= cutoff,
        AcsAccessEvent.event_type == "access_granted",
    )
    if device_id:
        q = q.filter(AcsAccessEvent.device_id == device_id)

    counts = defaultdict(int)
    for ev in q.all():
        if ev.created_at:
            counts[ev.created_at.hour] += 1

    # Return all 24 hours even if 0
    return {
        "days": days,
        "hourly": [{"hour": h, "count": counts[h]} for h in range(24)],
        "peak_hour": max(counts, key=counts.get) if counts else None,
    }


# ── Per-door stats ─────────────────────────────────────────────────────────────

@router.get("/by-door")
def by_door_stats(
    hours: int = Query(24 * 7, ge=1, le=720),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Access event counts grouped by device + door."""
    cutoff = _utcnow() - timedelta(hours=hours)
    events = (
        db.query(AcsAccessEvent)
        .options(joinedload(AcsAccessEvent.device))
        .filter(AcsAccessEvent.created_at >= cutoff)
        .all()
    )

    door_stats: dict[str, dict] = {}
    for ev in events:
        key = f"{ev.device_id}:{ev.door_no}"
        if key not in door_stats:
            door_stats[key] = {
                "device_id":   ev.device_id,
                "device_name": ev.device.name if ev.device else None,
                "door_no":     ev.door_no,
                "granted":     0,
                "denied":      0,
                "total":       0,
            }
        door_stats[key]["total"] += 1
        if ev.event_type == "access_granted":
            door_stats[key]["granted"] += 1
        elif ev.event_type == "access_denied":
            door_stats[key]["denied"] += 1

    result = sorted(door_stats.values(), key=lambda x: x["total"], reverse=True)
    return {"period_hours": hours, "doors": result}


# ── Top persons ────────────────────────────────────────────────────────────────

@router.get("/top-persons")
def top_persons(
    hours: int = Query(24 * 7, ge=1, le=720),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Most frequent persons by access count."""
    cutoff = _utcnow() - timedelta(hours=hours)
    rows = (
        db.query(
            AcsAccessEvent.person_id,
            func.count(AcsAccessEvent.id).label("count"),
        )
        .filter(
            AcsAccessEvent.created_at >= cutoff,
            AcsAccessEvent.person_id != None,
            AcsAccessEvent.event_type == "access_granted",
        )
        .group_by(AcsAccessEvent.person_id)
        .order_by(func.count(AcsAccessEvent.id).desc())
        .limit(limit)
        .all()
    )

    result = []
    for person_id, count in rows:
        person = db.get(Person, person_id)
        result.append({
            "person_id":   person_id,
            "person_name": person.full_name if person else None,
            "person_type": person.person_type if person else None,
            "access_count": count,
        })
    return {"period_hours": hours, "persons": result}


# ── Daily trend ────────────────────────────────────────────────────────────────

@router.get("/daily-trend")
def daily_trend(
    days: int = Query(30, ge=1, le=180),
    device_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Daily granted vs denied access counts for trend charts."""
    cutoff = _utcnow() - timedelta(days=days)
    q = db.query(AcsAccessEvent).filter(AcsAccessEvent.created_at >= cutoff)
    if device_id:
        q = q.filter(AcsAccessEvent.device_id == device_id)

    daily: dict[str, dict] = {}
    for ev in q.all():
        if not ev.created_at:
            continue
        day = ev.created_at.strftime("%Y-%m-%d")
        if day not in daily:
            daily[day] = {"date": day, "granted": 0, "denied": 0}
        if ev.event_type == "access_granted":
            daily[day]["granted"] += 1
        elif ev.event_type == "access_denied":
            daily[day]["denied"] += 1

    result = sorted(daily.values(), key=lambda x: x["date"])
    return {"days": days, "trend": result}


# ── Denial breakdown ───────────────────────────────────────────────────────────

@router.get("/denials")
def denial_breakdown(
    hours: int = Query(24 * 7, ge=1, le=720),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Denial log breakdown by reason."""
    cutoff = _utcnow() - timedelta(hours=hours)
    rows = (
        db.query(AcsDenialLog.denial_reason, func.count(AcsDenialLog.id).label("count"))
        .filter(AcsDenialLog.created_at >= cutoff)
        .group_by(AcsDenialLog.denial_reason)
        .order_by(func.count(AcsDenialLog.id).desc())
        .all()
    )
    return {
        "period_hours": hours,
        "by_reason": [{"reason": r, "count": c} for r, c in rows],
    }


# ── Bulk export ───────────────────────────────────────────────────────────────

@router.get("/export")
def export_access_events(
    hours: int    = Query(24 * 7, ge=1, le=8760),
    format: str   = Query("csv", regex="^(csv|excel)$"),
    device_id: Optional[int] = Query(None),
    event_type: Optional[str] = Query(None),
    db: Session   = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export access events as CSV or Excel (xlsx)."""
    cutoff = _utcnow() - timedelta(hours=hours)
    q = (
        db.query(AcsAccessEvent)
        .options(
            joinedload(AcsAccessEvent.device),
            joinedload(AcsAccessEvent.person),
        )
        .filter(AcsAccessEvent.created_at >= cutoff)
        .order_by(AcsAccessEvent.created_at.desc())
    )
    if device_id:
        q = q.filter(AcsAccessEvent.device_id == device_id)
    if event_type:
        q = q.filter(AcsAccessEvent.event_type == event_type)

    events = q.limit(10_000).all()

    rows = [["Time (UTC)", "Device", "Door", "Event Type", "Person", "Card Number",
             "Verify Mode", "Direction", "Denial Reason"]]
    for ev in events:
        rows.append([
            ev.created_at.strftime("%Y-%m-%d %H:%M:%S") if ev.created_at else "",
            ev.device.name if ev.device else str(ev.device_id or ""),
            str(ev.door_no or ""),
            ev.event_type or "",
            ev.person.full_name if ev.person else "",
            ev.card_number or "",
            ev.verify_mode or "",
            ev.direction or "",
            ev.denial_reason or "",
        ])

    if format == "excel":
        try:
            import openpyxl
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Access Events"
            for row in rows:
                ws.append(row)
            # Bold header
            from openpyxl.styles import Font
            for cell in ws[1]:
                cell.font = Font(bold=True)
            buf = io.BytesIO()
            wb.save(buf)
            buf.seek(0)
            fname = f"acs_events_{_utcnow().strftime('%Y%m%d')}.xlsx"
            return StreamingResponse(
                buf,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{fname}"'},
            )
        except ImportError:
            pass  # Fall through to CSV

    # CSV (default or Excel fallback)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerows(rows)
    buf.seek(0)
    fname = f"acs_events_{_utcnow().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8-sig")),  # utf-8-sig for Excel compat
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ── Offline card cache management ─────────────────────────────────────────────

@router.post("/offline-sync")
def sync_offline_cache(
    data: dict = {},
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Trigger offline card cache sync for one or all devices."""
    from app.acs_offline import sync_device_cards, sync_all_devices
    device_id = data.get("device_id")
    if device_id:
        result = sync_device_cards(db, int(device_id))
        return result
    return {"results": sync_all_devices(db)}


@router.get("/offline-cache")
def offline_cache_status(
    device_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """View offline card cache contents."""
    q = db.query(AcsOfflineCard)
    if device_id:
        q = q.filter(AcsOfflineCard.device_id == device_id)
    rows = q.order_by(AcsOfflineCard.synced_at.desc()).limit(500).all()
    return {
        "count": len(rows),
        "cards": [
            {
                "id":          r.id,
                "device_id":   r.device_id,
                "card_number": r.card_number,
                "person_id":   r.person_id,
                "person_name": r.person_name,
                "person_type": r.person_type,
                "valid_from":  r.valid_from,
                "valid_to":    r.valid_to,
                "synced_at":   r.synced_at,
            }
            for r in rows
        ],
    }


@router.post("/offline-check")
def check_offline_access(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if card is permitted offline."""
    from app.acs_offline import check_offline_access as _check
    device_id   = data.get("device_id")
    card_number = data.get("card_number")
    if not device_id or not card_number:
        return {"error": "device_id and card_number required"}
    return _check(db, int(device_id), str(card_number))
