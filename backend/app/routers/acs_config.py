"""ACS Config router — door config, face sync, device info, reports, interlock, event polling."""

import asyncio
import io
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.acs_access_limit import _find_person, _is_successful_access
from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db, SessionLocal
from app.models import AccessControlDevice, AcsAccessEvent, FaceEvent, Person, User
from app.secrets import decrypt_camera_password
from app.utils import (
    MEDIA_DIR,
    add_audit_log,
    save_bytes_to_media,
    sign_media_fields,
    utc_now,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/acs/cfg", tags=["acs_config"])
_executor = ThreadPoolExecutor(max_workers=4)


def _get_device(db: Session, device_id: int) -> AccessControlDevice:
    d = db.get(AccessControlDevice, device_id)
    if not d: raise HTTPException(404, "ACS device not found")
    return d


def _pw(device: AccessControlDevice) -> str:
    return decrypt_camera_password(device.password or "") if device.password else ""


async def _capture_access_face(
    db: Session,
    device: AccessControlDevice,
    access_event: AcsAccessEvent,
    face_rect: Optional[dict],
) -> bool:
    """Capture the face shown by a recent access-terminal event."""
    try:
        from app.face_engine import extract_faces
        from app.isapi_client import isapi_snapshot_sync
        from app.utils import crop_face_preview, full_media_path

        loop = asyncio.get_running_loop()
        image_bytes = await loop.run_in_executor(
            _executor,
            isapi_snapshot_sync,
            device.ip_address,
            device.http_port or 80,
            101,
            device.username or "admin",
            _pw(device),
        )
        original_path = save_bytes_to_media(image_bytes, "acs_event")
        original_full_path = full_media_path(original_path)
        detected_faces = extract_faces(original_full_path)
        if not detected_faces:
            try:
                os.remove(original_full_path)
            except OSError:
                pass
            return False
        best_face = max(
            detected_faces,
            key=lambda face: float(face.get("det_score") or 0),
        )
        crop_path = crop_face_preview(
            original_full_path,
            best_face.get("bbox"),
            "acs_face",
        )
        if not crop_path:
            return False

        db.add(FaceEvent(
            person_id=access_event.person_id,
            camera_ip=device.ip_address,
            camera_name=device.name,
            event_type="recognized" if access_event.person_id else "unknown",
            source="access_controller",
            image_path=original_path,
            crop_image_path=crop_path,
            original_image_path=original_path,
            raw_payload=f"ACS serial={access_event.source_serial_no}",
            created_at=access_event.created_at,
        ))
        db.commit()
        return True
    except Exception as exc:
        db.rollback()
        logger.warning(
            "Unable to capture face for ACS event %s on %s: %s",
            access_event.id,
            device.ip_address,
            exc,
        )
        return False


# ── Device info ───────────────────────────────────────────────────────────────

@router.get("/device-info/{device_id}")
async def device_info(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = _get_device(db, device_id)
    from app.isapi_acs import device_info_isapi
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _executor, device_info_isapi,
        d.ip_address, d.http_port or 80, d.username or "admin", _pw(d),
    )
    return {"device_id": device_id, **result}


# ── Door configuration ────────────────────────────────────────────────────────

@router.get("/door/{device_id}/{door_no}")
async def get_door_config(
    device_id: int,
    door_no: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = _get_device(db, device_id)
    if door_no < 1 or door_no > (d.door_count or 1):
        raise HTTPException(400, f"door_no must be 1–{d.door_count}")
    from app.isapi_acs import door_config_get
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _executor, door_config_get,
        d.ip_address, d.http_port or 80, d.username or "admin", _pw(d), door_no,
    )
    return result


@router.put("/door/{device_id}/{door_no}")
async def set_door_config(
    request: Request,
    device_id: int,
    door_no: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    d = _get_device(db, device_id)
    from app.isapi_acs import door_config_set
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _executor, door_config_set,
        d.ip_address, d.http_port or 80, d.username or "admin", _pw(d),
        door_no, data,
    )
    if result.get("ok"):
        add_audit_log(db, current_user, "ACS_DOOR_CFG_UPDATED", "acs_device", device_id,
                      f"Door {door_no} config updated on {d.name}",
                      request.client.host if request.client else None)
    return result


# ── Face / person sync ────────────────────────────────────────────────────────

@router.post("/face-sync/{device_id}/{person_id}")
async def sync_face_to_device(
    request: Request,
    device_id: int,
    person_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """Push a person's face photo to the ACS device face library."""
    d      = _get_device(db, device_id)
    person = db.get(Person, person_id)
    if not person: raise HTTPException(404, "Person not found")
    if not person.preview_image: raise HTTPException(400, "Person has no preview image")

    # Read the face image
    img_rel  = person.preview_image.strip("/").replace("/", os.sep)
    if img_rel.startswith("media" + os.sep):
        img_rel = img_rel[len("media" + os.sep):]
    img_path = os.path.join(MEDIA_DIR, img_rel)
    if not os.path.exists(img_path):
        raise HTTPException(404, "Person's face image not found on disk")

    with open(img_path, "rb") as f:
        face_bytes = f.read()

    from app.isapi_acs import face_sync_isapi
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _executor, face_sync_isapi,
        d.ip_address, d.http_port or 80, d.username or "admin", _pw(d),
        str(person_id), face_bytes,
    )

    add_audit_log(db, current_user, "ACS_FACE_SYNC", "person", person_id,
                  f"Face synced to {d.name}: {'OK' if result.get('ok') else result.get('message')}",
                  request.client.host if request.client else None)
    return {"person_id": person_id, "device_id": device_id, **result}


# ── Multi-door interlock ──────────────────────────────────────────────────────

@router.get("/interlock/{device_id}")
async def get_interlock(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = _get_device(db, device_id)
    from app.isapi_acs import interlock_get
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _executor, interlock_get,
        d.ip_address, d.http_port or 80, d.username or "admin", _pw(d),
    )


@router.put("/interlock/{device_id}")
async def set_interlock(
    request: Request,
    device_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    d = _get_device(db, device_id)
    enabled = bool(data.get("enabled", False))
    groups  = data.get("groups", [])

    from app.isapi_acs import interlock_set
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _executor, interlock_set,
        d.ip_address, d.http_port or 80, d.username or "admin", _pw(d),
        enabled, groups,
    )
    if result.get("ok"):
        add_audit_log(db, current_user, "ACS_INTERLOCK_SET", "acs_device", device_id,
                      f"Interlock {'enabled' if enabled else 'disabled'} on {d.name}, groups={groups}",
                      request.client.host if request.client else None)
    return result


# ── Event polling from device ─────────────────────────────────────────────────

@router.post("/poll-events/{device_id}")
async def poll_device_events(
    device_id: int,
    hours_back: int = Query(1, ge=1, le=24),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """Pull recent ACS events from the device and store in acs_access_events."""
    d = _get_device(db, device_id)
    from app.isapi_acs import acs_events_query_isapi
    loop = asyncio.get_running_loop()

    since = utc_now() - timedelta(hours=hours_back)
    start_str = since.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    end_str   = utc_now().strftime("%Y-%m-%dT%H:%M:%S+00:00")

    result = await loop.run_in_executor(
        _executor, acs_events_query_isapi,
        d.ip_address, d.http_port or 80, d.username or "admin", _pw(d),
        5, start_str, end_str, 100,
    )

    if not result.get("ok"):
        raise HTTPException(502, f"Device event query failed: {result.get('message')}")

    stored = 0
    recent_face_events = []
    for ev in result.get("events", []):
        card_no = ev.get("card_number")
        door_no = ev.get("door_no")
        ev_time_str = ev.get("time")
        serial_no = ev.get("serial_no")

        try:
            ev_time = datetime.fromisoformat(ev_time_str.replace("Z", "+00:00")) if ev_time_str else utc_now()
        except Exception:
            ev_time = utc_now()

        # Avoid duplicates — check by device + card + door + minute window
        if serial_no is not None:
            exists = db.query(AcsAccessEvent).filter(
                AcsAccessEvent.device_id == device_id,
                AcsAccessEvent.source_serial_no == serial_no,
            ).first()
            if not exists:
                exists = db.query(AcsAccessEvent).filter(
                    AcsAccessEvent.device_id   == device_id,
                    AcsAccessEvent.card_number == card_no,
                    AcsAccessEvent.door_no     == door_no,
                    AcsAccessEvent.created_at  >= ev_time - timedelta(seconds=2),
                    AcsAccessEvent.created_at  <= ev_time + timedelta(seconds=2),
                ).first()
        else:
            exists = db.query(AcsAccessEvent).filter(
                AcsAccessEvent.device_id   == device_id,
                AcsAccessEvent.card_number == card_no,
                AcsAccessEvent.door_no     == door_no,
                AcsAccessEvent.created_at  >= ev_time - timedelta(seconds=2),
                AcsAccessEvent.created_at  <= ev_time + timedelta(seconds=2),
            ).first()
        if exists:
            if (
                "face" in str(ev.get("verify_mode") or "").lower()
                and (
                    exists.person_id is None
                    or (
                        exists.person
                        and (exists.person.person_type or "").lower() == "unknown"
                    )
                )
                and abs((utc_now() - ev_time).total_seconds()) <= 20
            ):
                capture_exists = db.query(FaceEvent).filter(
                    FaceEvent.source == "access_controller",
                    FaceEvent.raw_payload == f"ACS serial={serial_no}",
                ).first()
                if not capture_exists:
                    recent_face_events.append((exists, ev.get("face_rect")))
            continue

        person = _find_person(db, ev)

        ae = AcsAccessEvent(
            device_id   = device_id,
            door_no     = door_no,
            card_number = card_no,
            person_id   = person.id if person else None,
            event_type  = "access_granted" if person and _is_successful_access(ev) else "access_event",
            verify_mode = ev.get("verify_mode"),
            source_serial_no = serial_no,
            created_at  = ev_time,
        )
        db.add(ae)
        db.flush()
        try:
            from app.routers.acs_anti_passback import process_access_event
            process_access_event(db, ae)
        except Exception:
            logger.exception("Anti-passback processing failed for polled ACS event")
        if (
            "face" in str(ev.get("verify_mode") or "").lower()
            and (
                ae.person_id is None
                or (
                    person
                    and (person.person_type or "").lower() == "unknown"
                )
            )
            and abs((utc_now() - ev_time).total_seconds()) <= 15
        ):
            recent_face_events.append((ae, ev.get("face_rect")))
        stored += 1

    db.commit()

    images_captured = 0
    for access_event, face_rect in recent_face_events:
        if await _capture_access_face(db, d, access_event, face_rect):
            images_captured += 1

    # Broadcast via WebSocket if new events
    if stored > 0:
        try:
            from app.ws_manager import manager as _ws
            import asyncio as _ai
            _ai.ensure_future(_ws.broadcast({
                "type":       "acs_events_polled",
                "device_id":  device_id,
                "new_events": stored,
            }))
        except Exception:
            pass

    return {"ok": True, "device_id": device_id, "new_events": stored,
            "images_captured": images_captured,
            "total_from_device": len(result.get("events", []))}


# ── Access Reports export ─────────────────────────────────────────────────────

@router.get("/reports/export")
def export_access_report(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to:   str = Query(..., description="YYYY-MM-DD"),
    device_id: Optional[int] = Query(None),
    fmt:       str = Query("excel", description="excel | pdf"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    from datetime import date
    try:
        d_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        d_to   = datetime.strptime(date_to,   "%Y-%m-%d").replace(
                     hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, "date_from and date_to must be YYYY-MM-DD")

    q = (
        db.query(AcsAccessEvent)
        .options(joinedload(AcsAccessEvent.person),
                 joinedload(AcsAccessEvent.device))
        .filter(AcsAccessEvent.created_at >= d_from,
                AcsAccessEvent.created_at <= d_to)
        .order_by(AcsAccessEvent.created_at.asc())
    )
    if device_id: q = q.filter(AcsAccessEvent.device_id == device_id)
    events = q.all()

    def fmt_dt(v):
        if not v: return ""
        return v.astimezone(timezone(timedelta(hours=4))).strftime("%Y-%m-%d %H:%M:%S")

    rows = []
    for ev in events:
        rows.append({
            "Date/Time":    fmt_dt(ev.created_at),
            "Device":       ev.device.name if ev.device else "",
            "Door":         ev.door_no or "",
            "Card Number":  ev.card_number or "",
            "Person Name":  ev.person.full_name if ev.person else "",
            "Department":   ev.person.department if ev.person else "",
            "Event Type":   (ev.event_type or "").replace("_", " ").title(),
            "Verify Mode":  ev.verify_mode or "",
        })

    if fmt == "excel":
        from openpyxl import Workbook
        from app.utils import style_excel_sheet
        wb = Workbook()
        ws = wb.active
        ws.title = "Access Report"
        if rows:
            ws.append(list(rows[0].keys()))
            for r in rows:
                ws.append(list(r.values()))
            style_excel_sheet(ws)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        filename = f"access_report_{date_from}_{date_to}.xlsx"
        return Response(
            content=buf.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # PDF
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
    from reportlab.lib.styles import getSampleStyleSheet

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()
    elements = [Paragraph(f"Access Report: {date_from} – {date_to}", styles["Title"])]

    headers = list(rows[0].keys()) if rows else []
    table_data = [headers] + [[str(r.get(h, "")) for h in headers] for r in rows]
    t = Table(table_data, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTSIZE",   (0, 0), (-1, -1), 7),
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    elements.append(t)
    doc.build(elements)
    buf.seek(0)
    filename = f"access_report_{date_from}_{date_to}.pdf"
    return Response(
        content=buf.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
