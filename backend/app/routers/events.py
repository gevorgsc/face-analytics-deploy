"""Events router - face events, alarm, stats, attendance, search, in/out."""

import logging
import re
from datetime import datetime, timedelta, timezone as _tz
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.faiss_engine import FAISS_AVAILABLE, search_all_persons_topk
from app.face_engine import compare_embeddings
from app.models import CameraDevice, FaceEvent, Person, User
from app.pagination import normalize_pagination
from app.rate_limit import rate_limiter
from app.schemas import EventOut
from app.utils import (
    add_audit_log,
    extract_faces_async,
    full_media_path,
    process_faces_and_create_events,
    read_limited,
    save_bytes_to_media,
    sign_media_collection,
    sign_media_fields,
    utc_now,
    yerevan_day_start_utc,
)
import json
import os

logger = logging.getLogger(__name__)
router = APIRouter(tags=["events"])
FACE_ANALYTICS_SOURCE = "face_analytics"

ALARM_RATE_LIMIT = int(os.getenv("ALARM_RATE_LIMIT", "60"))
_ALARM_ALLOWED_IPS_RAW = os.getenv("ALARM_ALLOWED_IPS", "")
ALARM_ALLOWED_IPS: set[str] = {ip.strip() for ip in _ALARM_ALLOWED_IPS_RAW.split(",") if ip.strip()}
CAMERA_AUTO_REGISTER = os.getenv("CAMERA_AUTO_REGISTER", "0") == "1"
# If set, every alarm request must include this key in X-Alarm-Key header or ?api_key= param.
# Recommended: set a long random string in .env for production security.
ALARM_API_KEY: str = os.getenv("ALARM_API_KEY", "")
# Set ALARM_OPEN_ACCESS=1 only in development/trusted-network environments where
# neither ALARM_API_KEY nor ALARM_ALLOWED_IPS is configured.
ALARM_OPEN_ACCESS: bool = os.getenv("ALARM_OPEN_ACCESS", "0").strip().lower() in {"1", "true", "yes"}


def _extract_ip(text: str) -> Optional[str]:
    m = re.search(r"(?:(?:\d{1,3}\.){3}\d{1,3})", text or "")
    return m.group(0) if m else None


def _check_alarm_rate_limit(ip: str) -> None:
    count = rate_limiter.hit_fixed_window(f"alarm:{ip}", ALARM_RATE_LIMIT, 60)
    if count > ALARM_RATE_LIMIT:
        raise HTTPException(429, f"Alarm rate limit exceeded for {ip}")


@router.get("/api/events", response_model=List[EventOut])
def list_events(
    response: Response,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    page = normalize_pagination(limit, offset)
    total = db.query(FaceEvent).filter(FaceEvent.source == FACE_ANALYTICS_SOURCE).count()
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Limit"] = str(page.limit)
    response.headers["X-Offset"] = str(page.offset)

    events = (
        db.query(FaceEvent)
        .options(joinedload(FaceEvent.person))
        .filter(FaceEvent.source == FACE_ANALYTICS_SOURCE)
        .order_by(FaceEvent.created_at.desc())
        .offset(page.offset)
        .limit(page.limit)
        .all()
    )
    for event in events:
        sign_media_fields(event)
        if event.person:
            sign_media_fields(event.person)
    return events


@router.delete("/api/events/{event_id}")
def delete_event(
    request: Request,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    ev = db.get(FaceEvent, event_id)
    if not ev:
        raise HTTPException(404, "Event not found")

    db.delete(ev)
    db.commit()

    add_audit_log(
        db, current_user, "EVENT_DELETED", "event", event_id,
        f"Deleted event #{event_id}",
        request.client.host if request.client else None,
    )

    return {"ok": True}


YEREVAN_OFFSET = timedelta(hours=4)

def _yerevan_day_to_utc(date_str: str):
    """Convert a Yerevan calendar date (YYYY-MM-DD) to a UTC datetime window (start, end)."""
    from datetime import date as _date
    d = _date.fromisoformat(date_str)
    # Yerevan midnight = UTC 20:00 previous day
    start = datetime(d.year, d.month, d.day, tzinfo=_tz.utc) - YEREVAN_OFFSET
    end   = start + timedelta(days=1)
    return start, end


@router.get("/api/attendance")
def attendance(
    limit: int = 200,
    person_id: Optional[str] = None,
    person_type: Optional[str] = None,
    date_from: Optional[str] = None,   # YYYY-MM-DD Yerevan
    date_to:   Optional[str] = None,   # YYYY-MM-DD Yerevan
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(FaceEvent)
        .options(joinedload(FaceEvent.person))
        .filter(FaceEvent.source == FACE_ANALYTICS_SOURCE)
        .order_by(FaceEvent.created_at.desc())
    )

    if person_id and person_id != "all":
        query = query.filter(FaceEvent.person_id == int(person_id))

    if person_type and person_type != "all":
        query = query.join(Person, FaceEvent.person_id == Person.id, isouter=True)
        query = query.filter(Person.person_type == person_type)

    if date_from:
        try:
            utc_start, _ = _yerevan_day_to_utc(date_from)
            query = query.filter(FaceEvent.created_at >= utc_start)
        except (ValueError, TypeError):
            pass

    if date_to:
        try:
            _, utc_end = _yerevan_day_to_utc(date_to)
            query = query.filter(FaceEvent.created_at < utc_end)
        except (ValueError, TypeError):
            pass

    events = query.limit(limit).all()
    timeline = []

    for e in events:
        name = e.person.full_name if e.person and e.person.full_name else "Unknown Person"
        ptype = e.person.person_type if e.person else "unknown"

        if ptype == "employee":
            title = f"{name} arrived"
        elif ptype == "vip":
            title = f"VIP client {name} visited"
        elif ptype == "blacklist":
            title = f"BLACKLIST person {name} detected"
        else:
            title = "Unknown person seen"

        timeline.append(sign_media_fields({
            "id": e.id,
            "title": title,
            "person_name": name,
            "person_type": ptype,
            "camera_name": e.camera_name,
            "direction": e.direction,
            "image_path": e.image_path,
            "crop_image_path": e.crop_image_path,
            "original_image_path": e.original_image_path,
            "created_at": e.created_at,
            "confidence": e.confidence,
            "face_quality": getattr(e, "face_quality", None),
            "quality_reason": getattr(e, "quality_reason", None),
            "is_low_quality": getattr(e, "is_low_quality", 0),
        }))

    return timeline


@router.get("/api/analytics/quality-by-camera")
def quality_by_camera(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-camera face quality breakdown for the Face Quality Dashboard."""
    rows = (
        db.query(
            FaceEvent.camera_name,
            func.count(FaceEvent.id).label("total"),
            func.sum(FaceEvent.is_low_quality).label("low_quality"),
            func.avg(FaceEvent.face_quality).label("avg_quality"),
        )
        .filter(FaceEvent.source == FACE_ANALYTICS_SOURCE)
        .group_by(FaceEvent.camera_name)
        .order_by(func.count(FaceEvent.id).desc())
        .all()
    )
    result = []
    for row in rows:
        total = int(row.total or 0)
        lq    = int(row.low_quality or 0)
        result.append({
            "camera_name":    row.camera_name or "Unknown",
            "total_events":   total,
            "low_quality":    lq,
            "high_quality":   total - lq,
            "low_quality_pct": round(lq / total * 100, 1) if total > 0 else 0,
            "avg_face_quality": round(float(row.avg_quality or 0), 3),
        })
    return result


@router.get("/api/stats")
def stats(
    hours: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.cache import cache
    cache_key = f"stats:dashboard:{hours or 'all'}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    today_start = yerevan_day_start_utc()
    today_end = today_start + timedelta(hours=24)

    total_events = db.query(FaceEvent).filter(FaceEvent.source == FACE_ANALYTICS_SOURCE).count()
    today_events = db.query(FaceEvent).filter(
        FaceEvent.source == FACE_ANALYTICS_SOURCE,
        FaceEvent.created_at >= today_start,
    ).count()
    total_persons = (
        db.query(Person)
        .filter(Person.full_name.isnot(None))
        .filter(Person.person_type != "unknown")
        .filter(Person.source != "acs")
        .count()
    )
    vip_count = db.query(Person).filter(
        Person.source != "acs", Person.person_type == "vip", Person.full_name.isnot(None),
    ).count()
    employee_count = db.query(Person).filter(
        Person.source != "acs", Person.person_type == "employee", Person.full_name.isnot(None),
    ).count()
    blacklist_count = db.query(Person).filter(
        Person.source != "acs", Person.person_type == "blacklist", Person.full_name.isnot(None),
    ).count()
    unknown_count = db.query(Person).filter(
        Person.source != "acs", Person.person_type == "unknown",
    ).count()
    low_quality_count = db.query(FaceEvent).filter(
        FaceEvent.source == FACE_ANALYTICS_SOURCE,
        FaceEvent.is_low_quality == 1,
    ).count()
    today_low_quality_count = db.query(FaceEvent).filter(
        FaceEvent.source == FACE_ANALYTICS_SOURCE,
        FaceEvent.is_low_quality == 1,
        FaceEvent.created_at >= today_start,
    ).count()
    total_cameras = db.query(CameraDevice).count()
    active_cameras = db.query(CameraDevice).filter(CameraDevice.is_active == 1).count()

    hourly_rows = (
        db.query(
            extract("hour", FaceEvent.created_at).label("h"),
            func.count(FaceEvent.id).label("cnt"),
        )
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.created_at >= today_start,
            FaceEvent.created_at < today_end,
        )
        .group_by("h")
        .all()
    )
    hourly_map = {int(row.h): row.cnt for row in hourly_rows}
    hourly = [{"hour": f"{i:02d}:00", "count": hourly_map.get(i, 0)} for i in range(24)]

    cam_q = db.query(FaceEvent.camera_name, func.count(FaceEvent.id)).filter(
        FaceEvent.source == FACE_ANALYTICS_SOURCE,
    )
    if hours:
        since = datetime.now(_tz.utc) - timedelta(hours=hours)
        cam_q = cam_q.filter(FaceEvent.created_at >= since)
    top_cameras = (
        cam_q
        .group_by(FaceEvent.camera_name)
        .order_by(func.count(FaceEvent.id).desc())
        .limit(50)
        .all()
    )

    result = {
        "total_events": total_events,
        "today_events": today_events,
        "total_persons": total_persons,
        "vip_count": vip_count,
        "employee_count": employee_count,
        "blacklist_count": blacklist_count,
        "unknown_count": unknown_count,
        "low_quality_count": low_quality_count,
        "today_low_quality_count": today_low_quality_count,
        "total_cameras": total_cameras,
        "active_cameras": active_cameras,
        "hourly": hourly,
        "top_cameras": [{"camera": x[0] or "Unknown", "count": x[1]} for x in top_cameras],
    }

    cache.set(cache_key, result, ttl=30)
    return result


@router.get("/api/stats/hourly-cameras")
def hourly_cameras_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns per-camera event counts grouped by hour for today (for time-lapse heatmap)."""
    from app.utils import yerevan_day_start_utc
    today_start = yerevan_day_start_utc()
    today_end   = today_start + timedelta(hours=24)

    rows = (
        db.query(
            FaceEvent.camera_name,
            extract("hour", FaceEvent.created_at).label("h"),
            func.count(FaceEvent.id).label("cnt"),
        )
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.created_at >= today_start,
            FaceEvent.created_at < today_end,
        )
        .group_by(FaceEvent.camera_name, "h")
        .all()
    )

    # Structure: { camera_name: { hour: count } }
    result = {}
    for row in rows:
        cam = row.camera_name or "Unknown"
        if cam not in result:
            result[cam] = {}
        result[cam][int(row.h)] = row.cnt

    return result


@router.get("/api/stats/in-out")
def in_out_stats(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime, timezone as tz
    today_start = yerevan_day_start_utc()
    today_end = today_start + timedelta(hours=24)
    cap = max(1, min(limit, 200))

    today_query = db.query(FaceEvent).filter(
        FaceEvent.source == FACE_ANALYTICS_SOURCE,
        FaceEvent.created_at >= today_start,
        FaceEvent.created_at < today_end,
    )
    in_count_today  = today_query.filter(FaceEvent.direction == "in").count()
    out_count_today = today_query.filter(FaceEvent.direction == "out").count()

    # -- Currently Inside -----------------------------------------------------
    # Use a subquery to get only the latest directional event per person (DB-side dedup).
    latest_per_person_sq = (
        db.query(
            FaceEvent.person_id,
            func.max(FaceEvent.created_at).label("max_ts"),
        )
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.direction.in_(["in", "out"]),
            FaceEvent.person_id.isnot(None),
        )
        .group_by(FaceEvent.person_id)
        .subquery()
    )
    latest_directional_events = (
        db.query(FaceEvent)
        .options(joinedload(FaceEvent.person))
        .join(
            latest_per_person_sq,
            (FaceEvent.person_id == latest_per_person_sq.c.person_id)
            & (FaceEvent.created_at == latest_per_person_sq.c.max_ts),
        )
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.direction.in_(["in", "out"]),
        )
        .all()
    )

    inside_events = sorted(
        [ev for ev in latest_directional_events if ev.direction == "in"],
        key=lambda e: e.created_at or datetime.min.replace(tzinfo=tz.utc),
        reverse=True,
    )

    def _person_row(ev):
        p = ev.person
        if not p:
            return None
        return sign_media_fields({
            "id": p.id,
            "full_name": p.full_name,
            "display_name": p.full_name or getattr(p, "unknown_label", None) or f"Unknown #{p.id}",
            "person_type": p.person_type,
            "preview_image": p.preview_image,
            "last_seen": ev.created_at,
            "camera_name": ev.camera_name,
            "direction": ev.direction,
        })

    inside_persons = [r for r in (_person_row(e) for e in inside_events[:cap]) if r]

    # -- Entered Today ---------------------------------------------------------
    entered_first_sq = (
        db.query(
            FaceEvent.person_id,
            func.min(FaceEvent.created_at).label("first_ts"),
        )
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.direction == "in",
            FaceEvent.created_at >= today_start,
            FaceEvent.created_at < today_end,
            FaceEvent.person_id.isnot(None),
        )
        .group_by(FaceEvent.person_id)
        .subquery()
    )
    entered_events = (
        db.query(FaceEvent)
        .options(joinedload(FaceEvent.person))
        .join(
            entered_first_sq,
            (FaceEvent.person_id == entered_first_sq.c.person_id)
            & (FaceEvent.created_at == entered_first_sq.c.first_ts),
        )
        .order_by(FaceEvent.created_at.desc())
        .limit(cap)
        .all()
    )
    entered_today_persons = [r for r in (_person_row(e) for e in entered_events) if r]

    # -- Exited Today ----------------------------------------------------------
    exited_last_sq = (
        db.query(
            FaceEvent.person_id,
            func.max(FaceEvent.created_at).label("last_ts"),
        )
        .filter(
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
            FaceEvent.direction == "out",
            FaceEvent.created_at >= today_start,
            FaceEvent.created_at < today_end,
            FaceEvent.person_id.isnot(None),
        )
        .group_by(FaceEvent.person_id)
        .subquery()
    )
    exited_events = (
        db.query(FaceEvent)
        .options(joinedload(FaceEvent.person))
        .join(
            exited_last_sq,
            (FaceEvent.person_id == exited_last_sq.c.person_id)
            & (FaceEvent.created_at == exited_last_sq.c.last_ts),
        )
        .order_by(FaceEvent.created_at.desc())
        .limit(cap)
        .all()
    )
    exited_today_persons = [r for r in (_person_row(e) for e in exited_events) if r]

    return {
        "in_count_today": in_count_today,
        "out_count_today": out_count_today,
        "currently_inside": len(inside_events),
        "inside_persons": inside_persons,
        "entered_today_persons": entered_today_persons,
        "exited_today_persons": exited_today_persons,
    }


@router.post("/api/alarm/hikvision")
async def hikvision_alarm(request: Request, db: Session = Depends(get_db)):
    camera_ip = request.client.host if request.client else "unknown"

    # API key check (highest priority - use in production)
    if ALARM_API_KEY:
        provided_key = (
            request.headers.get("X-Alarm-Key", "")
            or request.query_params.get("api_key", "")
        )
        if provided_key != ALARM_API_KEY:
            raise HTTPException(401, "Invalid or missing alarm API key")
    elif ALARM_ALLOWED_IPS:
        if camera_ip not in ALARM_ALLOWED_IPS:
            raise HTTPException(403, f"IP {camera_ip} not in ALARM_ALLOWED_IPS")
    elif not ALARM_OPEN_ACCESS:
        raise HTTPException(
            403,
            "Alarm endpoint requires ALARM_API_KEY or ALARM_ALLOWED_IPS. "
            "Set ALARM_OPEN_ACCESS=1 to allow unauthenticated access.",
        )

    _check_alarm_rate_limit(camera_ip)
    logger.info("Hikvision alarm received from %s", camera_ip)

    content_type = request.headers.get("content-type", "")
    raw_parts = []
    saved_image = None

    if "multipart" in content_type.lower():
        form = await request.form()
        for key, val in form.multi_items():
            if hasattr(val, "filename") and val.filename:
                if val.content_type and "image" in val.content_type.lower():
                    data = await read_limited(val)
                    saved_image = save_bytes_to_media(data, "hik_original")
                    raw_parts.append(f"{key}=IMAGE {val.filename} {val.content_type}")
                else:
                    raw_parts.append(f"{key}=FILE {val.filename} {val.content_type}")
            else:
                raw_parts.append(f"{key}={val}")
    else:
        body = await request.body()
        raw_parts.append(body.decode("utf-8", errors="ignore"))

    raw_payload = "\n".join(raw_parts)[:20000]
    ip_from_payload = _extract_ip(raw_payload)
    camera_ip = ip_from_payload or camera_ip
    camera_name = f"Camera {camera_ip}" if camera_ip else "Face Camera"
    camera_direction = "both"
    camera = None

    if camera_ip:
        camera = db.query(CameraDevice).filter(CameraDevice.ip_address == camera_ip).first()
        if camera:
            camera_name = camera.name or camera_name
            camera_direction = camera.direction or "both"
        elif CAMERA_AUTO_REGISTER:
            total = db.query(CameraDevice).count()
            auto_name = f"Camera #{total + 1}"
            camera = CameraDevice(
                name=auto_name,
                ip_address=camera_ip,
                port=554,
                is_active=1,
                ai_enabled=1,
                live_enabled=0,
                direction="both",
                notes="Auto-registered on first alarm",
            )
            db.add(camera)
            db.commit()
            db.refresh(camera)
            camera_name = auto_name
            logger.info("Auto-registered camera: %s (%s)", auto_name, camera_ip)

            # Notify all connected clients so they can refresh and configure the new camera
            from app.ws_manager import manager as _ws
            import asyncio as _asyncio
            try:
                _asyncio.ensure_future(_ws.broadcast({
                    "type":        "camera_auto_registered",
                    "camera_id":   camera.id,
                    "camera_name": camera_name,
                    "camera_ip":   camera_ip,
                }))
            except Exception as _we:
                logger.debug("camera_auto_registered broadcast failed: %s", _we)

    if not saved_image:
        return {"ok": True, "saved": False, "message": "Alarm received, but no image found", "camera_ip": camera_ip}

    image_full_path = full_media_path(saved_image)
    result = await process_faces_and_create_events(
        db=db,
        image_full_path=image_full_path,
        original_image_path=saved_image,
        camera_ip=camera_ip,
        camera_name=camera_name,
        raw_payload=raw_payload,
        prefix="hik",
        direction=camera_direction,
        camera_id=camera.id if camera else None,
    )

    first = result["events"][0] if result["events"] else None

    return sign_media_fields({
        "ok": True,
        "saved": bool(result["events"]),
        "multi_face": True,
        "face_count": result["face_count"],
        "events_created": len(result["events"]),
        "skipped_faces": result["skipped"],
        "event_ids": [x["event"].id for x in result["events"]],
        "first_event_id": first["event"].id if first else None,
        "first_person_id": first["person"].id if first else None,
        "first_person_type": first["person"].person_type if first else None,
        "first_confidence": first["confidence"] if first else None,
        "image": first["event"].image_path if first else saved_image,
        "crop_image": first["event"].crop_image_path if first else saved_image,
        "original_image": saved_image,
    })


@router.post("/api/test/upload")
async def test_upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    data = await read_limited(file)
    img_path = save_bytes_to_media(data, "manual_original")
    image_full_path = full_media_path(img_path)

    result = await process_faces_and_create_events(
        db=db,
        image_full_path=image_full_path,
        original_image_path=img_path,
        camera_ip="manual",
        camera_name="Manual Upload",
        raw_payload=None,
        prefix="manual",
    )

    if not result["events"]:
        return {
            "ok": False,
            "message": "No faces found",
            "multi_face": True,
            "face_count": result["face_count"],
            "events_created": 0,
            "skipped_faces": result["skipped"],
        }

    first_event_obj = result["events"][0]["event"]
    event = db.query(FaceEvent).options(joinedload(FaceEvent.person)).filter(FaceEvent.id == first_event_obj.id).first()

    return {
        "ok": True,
        "multi_face": True,
        "face_count": result["face_count"],
        "events_created": len(result["events"]),
        "skipped_faces": result["skipped"],
        "event_ids": [x["event"].id for x in result["events"]],
        "first_event": sign_media_fields(event),
    }


@router.post("/api/search/by-picture")
async def search_by_picture(
    file: UploadFile = File(...),
    limit: int = 50,
    threshold: float = 0.25,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    data = await read_limited(file)
    img_path = save_bytes_to_media(data, "search_upload")
    full_path = full_media_path(img_path)

    faces = await extract_faces_async(full_path)
    if not faces:
        raise HTTPException(400, "No face found in uploaded image")

    search_embeddings = [face["embedding"] for face in faces[:5]]

    if FAISS_AVAILABLE:
        person_scores: dict[int, float] = {}
        for emb in search_embeddings:
            for pid, score in search_all_persons_topk(db, Person, emb, threshold, k=limit):
                if pid not in person_scores or score > person_scores[pid]:
                    person_scores[pid] = score

        if person_scores:
            top_ids = sorted(person_scores, key=person_scores.get, reverse=True)[:limit]
            events = (
                db.query(FaceEvent)
                .options(joinedload(FaceEvent.person))
                .filter(
                    FaceEvent.source == FACE_ANALYTICS_SOURCE,
                    FaceEvent.person_id.in_(top_ids),
                )
                .order_by(FaceEvent.created_at.desc())
                .limit(limit)
                .all()
            )
            results = [
                {
                    "id": e.id,
                    "person_id": e.person_id,
                    "score": float(person_scores.get(e.person_id, 0)),
                    "image_path": e.image_path,
                    "crop_image_path": e.crop_image_path,
                    "original_image_path": e.original_image_path,
                    "camera_name": e.camera_name,
                    "created_at": e.created_at,
                    "person_name": e.person.full_name if e.person else "Unknown",
                    "person_type": e.person.person_type if e.person else "unknown",
                }
                for e in events if e.person_id in person_scores
            ]
            results.sort(key=lambda x: x["score"], reverse=True)
            return {"count": len(results), "results": sign_media_collection(results)}

    # Linear fallback
    events = (
        db.query(FaceEvent)
        .options(joinedload(FaceEvent.person))
        .filter(FaceEvent.source == FACE_ANALYTICS_SOURCE)
        .order_by(FaceEvent.created_at.desc())
        .limit(500)
        .all()
    )
    results = []
    for event in events:
        if not event.person or not event.person.face_embedding:
            continue
        try:
            stored = json.loads(event.person.face_embedding)
            score = max(compare_embeddings(e, stored) for e in search_embeddings)
            if score >= threshold:
                results.append({
                    "id": event.id,
                    "person_id": event.person_id,
                    "score": float(score),
                    "image_path": event.image_path,
                    "crop_image_path": event.crop_image_path,
                    "original_image_path": event.original_image_path,
                    "camera_name": event.camera_name,
                    "created_at": event.created_at,
                    "person_name": event.person.full_name or "Unknown",
                    "person_type": event.person.person_type or "unknown",
                })
        except Exception:
            continue

    results.sort(key=lambda x: x["score"], reverse=True)
    return {"count": len(results[:50]), "results": sign_media_collection(results[:50])}
