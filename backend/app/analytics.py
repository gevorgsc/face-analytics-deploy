"""
analytics.py - GSC Face Analytics Pro
Advanced analytics endpoints: heatmap, repeat visitors, camera activity.

Add to main.py:
    from app.analytics import router as analytics_router
    app.include_router(analytics_router)
"""

from datetime import datetime, timedelta, timezone
from collections import defaultdict
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.auth import get_current_user
from app.models import FaceEvent, Person

try:
    YEREVAN_TZ = ZoneInfo("Asia/Yerevan")
except Exception:
    YEREVAN_TZ = timezone(timedelta(hours=4))


router = APIRouter(prefix="/api/analytics", tags=["analytics"])
FACE_ANALYTICS_SOURCE = "face_analytics"


# ============================================================
# HEATMAP: hour Г— day-of-week activity
# ============================================================

@router.get("/heatmap")
def heatmap(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Returns 7Г—24 grid (day-of-week Г— hour) of event counts."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    events = (
        db.query(FaceEvent.created_at)
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.created_at >= since,
        )
        .all()
    )

    # grid[day_of_week (0=Mon)][hour] = count
    grid = [[0] * 24 for _ in range(7)]

    for (created_at,) in events:
        if not created_at:
            continue
        local = created_at.replace(tzinfo=timezone.utc).astimezone(YEREVAN_TZ)
        dow = local.weekday()
        hour = local.hour
        if 0 <= dow < 7 and 0 <= hour < 24:
            grid[dow][hour] += 1

    days_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return {
        "days": days_labels,
        "hours": list(range(24)),
        "data": grid,
        "total_events": sum(sum(row) for row in grid),
        "period_days": days,
    }


# ============================================================
# REPEAT VISITORS: unknown persons seen 3+ times
# ============================================================

@router.get("/repeat-visitors")
def repeat_visitors(
    min_visits: int = Query(3, ge=2, le=100),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Unknown persons seen в‰Ґ min_visits times in last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Group events by person_id
    counts = (
        db.query(
            FaceEvent.person_id,
            func.count(FaceEvent.id).label("visit_count"),
            func.max(FaceEvent.created_at).label("last_visit"),
            func.min(FaceEvent.created_at).label("first_visit"),
        )
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.created_at >= since,
        )
        .filter(FaceEvent.person_id.isnot(None))
        .group_by(FaceEvent.person_id)
        .having(func.count(FaceEvent.id) >= min_visits)
        .all()
    )

    person_ids = [row.person_id for row in counts]
    persons_map = {
        p.id: p
        for p in db.query(Person).filter(Person.id.in_(person_ids)).all()
    }

    # Fetch distinct cameras for all persons in one query
    camera_rows = (
        db.query(FaceEvent.person_id, FaceEvent.camera_name)
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.person_id.in_(person_ids),
        )
        .filter(FaceEvent.created_at >= since)
        .filter(FaceEvent.camera_name.isnot(None))
        .distinct()
        .all()
    )
    cameras_by_person: dict[int, list] = {}
    for pid, cam in camera_rows:
        cameras_by_person.setdefault(pid, []).append(cam)

    result = []
    for row in counts:
        person = persons_map.get(row.person_id)
        if not person or person.person_type != "unknown":
            continue
        camera_names = cameras_by_person.get(row.person_id, [])
        result.append({
            "person_id": person.id,
            "preview_image": person.preview_image,
            "visit_count": row.visit_count,
            "first_visit": row.first_visit.isoformat() if row.first_visit else None,
            "last_visit": row.last_visit.isoformat() if row.last_visit else None,
            "cameras": camera_names,
            "camera_count": len(camera_names),
            "unknown_label": person.unknown_label,
        })

    result.sort(key=lambda r: r["visit_count"], reverse=True)
    return {"visitors": result, "count": len(result), "period_days": days}


# ============================================================
# CAMERA ACTIVITY OVER TIME
# ============================================================

@router.get("/camera-activity")
def camera_activity(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Per-camera daily event counts."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    events = (
        db.query(FaceEvent.camera_name, FaceEvent.created_at)
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.created_at >= since,
        )
        .filter(FaceEvent.camera_name.isnot(None))
        .all()
    )

    # Build {camera: {date: count}}
    data = defaultdict(lambda: defaultdict(int))
    for cam, ts in events:
        if not ts:
            continue
        day_key = ts.strftime("%Y-%m-%d")
        data[cam][day_key] += 1

    # Build day list
    day_list = []
    for i in range(days - 1, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        day_list.append(day)

    result = []
    for cam_name, day_counts in data.items():
        result.append({
            "camera": cam_name,
            "total": sum(day_counts.values()),
            "series": [
                {"date": day, "count": day_counts.get(day, 0)}
                for day in day_list
            ],
        })

    result.sort(key=lambda r: r["total"], reverse=True)
    return {"cameras": result, "days": day_list, "period_days": days}


# ============================================================
# PERSON TYPE DISTRIBUTION (over time)
# ============================================================

@router.get("/quality-stats")
def quality_stats(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Per-camera face quality statistics for the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        db.query(
            FaceEvent.camera_name,
            func.count(FaceEvent.id).label("total"),
            func.sum(FaceEvent.is_low_quality).label("low_q"),
            func.avg(FaceEvent.face_quality).label("avg_quality"),
            func.min(FaceEvent.face_quality).label("min_quality"),
            func.max(FaceEvent.face_quality).label("max_quality"),
        )
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.created_at >= since,
        )
        .filter(FaceEvent.camera_name.isnot(None))
        .group_by(FaceEvent.camera_name)
        .all()
    )

    result = []
    for r in rows:
        total = r.total or 0
        low_q = int(r.low_q or 0)
        result.append({
            "camera": r.camera_name,
            "total": total,
            "low_quality": low_q,
            "good_quality": total - low_q,
            "low_quality_pct": round(low_q / total * 100, 1) if total > 0 else 0,
            "avg_quality": round(float(r.avg_quality), 1) if r.avg_quality else 0,
            "min_quality": round(float(r.min_quality), 1) if r.min_quality else 0,
            "max_quality": round(float(r.max_quality), 1) if r.max_quality else 0,
        })

    result.sort(key=lambda x: x["total"], reverse=True)
    return {"cameras": result, "period_days": days}


# ============================================================
# AGE / GENDER DEMOGRAPHICS
# ============================================================

@router.get("/age-gender")
def age_gender_stats(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Age bucket + gender distribution for events in the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    events = (
        db.query(FaceEvent.age, FaceEvent.gender)
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.created_at >= since,
        )
        .filter(FaceEvent.age.isnot(None))
        .all()
    )

    age_buckets = {"0-18": 0, "19-30": 0, "31-45": 0, "46-60": 0, "60+": 0}
    gender_counts = {"Male": 0, "Female": 0, "Unknown": 0}

    for age, gender in events:
        if age is not None:
            if age <= 18:
                age_buckets["0-18"] += 1
            elif age <= 30:
                age_buckets["19-30"] += 1
            elif age <= 45:
                age_buckets["31-45"] += 1
            elif age <= 60:
                age_buckets["46-60"] += 1
            else:
                age_buckets["60+"] += 1

        g = (gender or "").strip().capitalize()
        if g in ("Male", "Female"):
            gender_counts[g] += 1
        else:
            gender_counts["Unknown"] += 1

    return {
        "age_distribution": [{"bucket": k, "count": v} for k, v in age_buckets.items()],
        "gender_distribution": [{"gender": k, "count": v} for k, v in gender_counts.items()],
        "total_with_age": sum(age_buckets.values()),
        "total_with_gender": sum(gender_counts.values()),
        "period_days": days,
    }


# ============================================================
# DWELL TIME — how long people stay per visit
# ============================================================

@router.get("/dwell-time")
def dwell_time_stats(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Distribution of how long registered persons stay (max - min event time per person per day)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        db.query(
            FaceEvent.person_id,
            func.date(FaceEvent.created_at).label("visit_date"),
            func.min(FaceEvent.created_at).label("first_seen"),
            func.max(FaceEvent.created_at).label("last_seen"),
            func.count(FaceEvent.id).label("event_count"),
        )
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.created_at >= since,
        )
        .filter(FaceEvent.person_id.isnot(None))
        .group_by(FaceEvent.person_id, func.date(FaceEvent.created_at))
        .having(func.count(FaceEvent.id) >= 2)
        .all()
    )

    buckets = {
        "<5m": 0, "5-15m": 0, "15-30m": 0,
        "30-60m": 0, "1-2h": 0, ">2h": 0,
    }
    total_visits = 0
    total_dwell_minutes = 0.0

    for row in rows:
        if not row.first_seen or not row.last_seen:
            continue
        dwell = (row.last_seen - row.first_seen).total_seconds() / 60
        total_visits += 1
        total_dwell_minutes += dwell

        if dwell < 5:
            buckets["<5m"] += 1
        elif dwell < 15:
            buckets["5-15m"] += 1
        elif dwell < 30:
            buckets["15-30m"] += 1
        elif dwell < 60:
            buckets["30-60m"] += 1
        elif dwell < 120:
            buckets["1-2h"] += 1
        else:
            buckets[">2h"] += 1

    return {
        "buckets": [{"range": k, "count": v} for k, v in buckets.items()],
        "total_visits": total_visits,
        "avg_dwell_minutes": round(total_dwell_minutes / total_visits, 1) if total_visits > 0 else 0,
        "period_days": days,
    }


# ============================================================
# VISITOR FLOW — cross-camera transitions
# ============================================================

@router.get("/visitor-flow")
def visitor_flow(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Camera-to-camera transition counts (same person seen on cam A then cam B within 1 hour)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    events = (
        db.query(FaceEvent.person_id, FaceEvent.camera_name, FaceEvent.created_at)
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.created_at >= since,
        )
        .filter(FaceEvent.person_id.isnot(None))
        .filter(FaceEvent.camera_name.isnot(None))
        .order_by(FaceEvent.person_id, FaceEvent.created_at)
        .all()
    )

    transitions: dict = defaultdict(int)
    camera_set: set = set()
    person_events: dict = {}

    for pid, cam, ts in events:
        person_events.setdefault(pid, []).append((cam, ts))
        camera_set.add(cam)

    for pid, cam_list in person_events.items():
        for i in range(len(cam_list) - 1):
            from_cam, from_ts = cam_list[i]
            to_cam, to_ts = cam_list[i + 1]
            if from_cam != to_cam:
                diff_min = (to_ts - from_ts).total_seconds() / 60
                if 0 < diff_min <= 60:
                    transitions[(from_cam, to_cam)] += 1

    cameras = sorted(camera_set)
    flow_matrix = []
    for from_cam in cameras:
        row = {"from": from_cam}
        for to_cam in cameras:
            row[to_cam] = transitions.get((from_cam, to_cam), 0)
        flow_matrix.append(row)

    top_transitions = [
        {"from": k[0], "to": k[1], "count": v}
        for k, v in sorted(transitions.items(), key=lambda x: -x[1])[:15]
    ]

    return {
        "cameras": cameras,
        "matrix": flow_matrix,
        "top_transitions": top_transitions,
        "period_days": days,
    }


@router.get("/type-distribution")
def type_distribution(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Event counts by person_type per day."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    events = (
        db.query(FaceEvent.created_at, Person.person_type)
        .outerjoin(Person, FaceEvent.person_id == Person.id)
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.created_at >= since,
        )
        .all()
    )

    by_day = defaultdict(lambda: defaultdict(int))
    for ts, ptype in events:
        if not ts:
            continue
        day_key = ts.strftime("%Y-%m-%d")
        by_day[day_key][ptype or "unknown"] += 1

    day_list = []
    for i in range(days - 1, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        day_list.append(day)

    series = []
    for day in day_list:
        d = by_day.get(day, {})
        series.append({
            "date": day,
            "employee":  d.get("employee", 0),
            "vip":       d.get("vip", 0),
            "blacklist": d.get("blacklist", 0),
            "unknown":   d.get("unknown", 0),
            "total":     sum(d.values()),
        })

    return {"series": series, "period_days": days}
