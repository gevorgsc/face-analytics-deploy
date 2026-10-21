"""Reporting Center API: dashboard, report builder, schedules, and history."""

import base64
import hashlib
import hmac
import json
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.auth import ALGORITHM, SECRET_KEY, require_admin
from app.db import get_db
from app.models import CameraDevice, Person, ReportRun, ScheduledReport, User
from app.report_scheduler import REPORT_TYPES, VALID_FORMATS, dashboard_data, execute_scheduled_report, generate_report_run, normalize_settings, resolve_filters
from app.utils import add_audit_log, utc_now

router = APIRouter(prefix="/api/reports", tags=["reports"])
REPORT_PREVIEW_TTL_SECONDS = 60


def _preview_payload(report_id: int, exp: int) -> str:
    return f"/api/reports/{report_id}/preview|{exp}"


def _sign_preview_url(report_id: int, exp: int) -> str:
    digest = hmac.new(SECRET_KEY.encode("utf-8"), _preview_payload(report_id, exp).encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def _verify_preview_signature(report_id: int, exp: Optional[int], sig: Optional[str]) -> bool:
    return bool(exp and sig and exp >= int(time.time()) and hmac.compare_digest(_sign_preview_url(report_id, exp), sig))


def _require_admin_from_request(request: Request, db: Session, token: Optional[str]) -> User:
    bearer = request.headers.get("Authorization", "")
    raw = token or (bearer[7:] if bearer.startswith("Bearer ") else None)
    if not raw:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(raw, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Invalid token")
    except JWTError as error:
        raise HTTPException(401, "Invalid token") from error
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(401, "Inactive or unknown user")
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user


def _report_dict(report: ScheduledReport) -> dict:
    return {
        "id": report.id, "name": report.name, "report_type": report.report_type, "format": report.format,
        "schedule_cron": report.schedule_cron, "recipients": json.loads(report.recipients or "[]"),
        "settings": normalize_settings(report.settings), "is_active": bool(report.is_active),
        "last_sent_at": report.last_sent_at, "last_run_status": report.last_run_status,
        "last_run_message": report.last_run_message, "created_at": report.created_at,
    }


def _run_dict(run: ReportRun) -> dict:
    return {
        "id": run.id, "scheduled_report_id": run.scheduled_report_id, "report_name": run.report_name,
        "report_type": run.report_type, "format": run.format, "status": run.status,
        "delivery_status": run.delivery_status, "parameters": normalize_settings({"filters": json.loads(run.parameters or "{}").get("filters", {})}) if run.parameters else {},
        "file_name": run.file_name, "row_count": run.row_count, "message": run.message,
        "initiated_by": run.initiated_by, "started_at": run.started_at, "completed_at": run.completed_at,
        "download_url": f"/api/reports/runs/{run.id}/download" if run.file_path else None,
    }


def _validate_report_input(data: dict) -> tuple[str, str, list[str], dict]:
    report_type = data.get("report_type", "attendance")
    if report_type not in REPORT_TYPES:
        raise HTTPException(400, f"report_type must be one of: {sorted(REPORT_TYPES)}")
    fmt = data.get("format", "excel")
    if fmt not in VALID_FORMATS:
        raise HTTPException(400, f"format must be one of: {sorted(VALID_FORMATS)}")
    recipients = [str(item).strip() for item in (data.get("recipients") or []) if str(item).strip()]
    settings = normalize_settings(data.get("settings"))
    if settings["delivery"].get("email") and not recipients:
        raise HTTPException(400, "Add at least one email recipient or turn off email delivery")
    return report_type, fmt, recipients, settings


@router.get("/catalog")
def report_catalog(current_user: User = Depends(require_admin)):
    return {"types": [{"id": item_id, **info} for item_id, info in REPORT_TYPES.items()], "formats": sorted(VALID_FORMATS), "periods": ["today", "last_7_days", "last_30_days", "this_month", "custom"]}


@router.get("/people")
def report_people(
    search: Optional[str] = None,
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Registered people available for an individual report export."""
    query = db.query(Person).filter(Person.full_name.isnot(None))
    if search and search.strip():
        term = search.strip()
        if term.isdigit():
            query = query.filter(Person.id == int(term))
        else:
            query = query.filter(Person.full_name.ilike(f"%{term}%"))
    people = query.order_by(Person.full_name.asc()).limit(limit).all()
    return {"people": [{"id": person.id, "full_name": person.full_name, "department": person.department, "person_type": person.person_type} for person in people]}


@router.get("/cameras")
def report_cameras(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """Cameras available for filtering Face Analytics reports."""
    cameras = db.query(CameraDevice).order_by(CameraDevice.name.asc()).all()
    return {"cameras": [{"id": camera.id, "name": camera.name, "location": camera.location, "is_active": bool(camera.is_active)} for camera in cameras]}


@router.get("/dashboard")
def reporting_dashboard(
    date_from: Optional[str] = None, date_to: Optional[str] = None, camera_id: Optional[int] = None,
    camera_name: Optional[str] = None, direction: Optional[str] = None,
    db: Session = Depends(get_db), current_user: User = Depends(require_admin),
):
    return dashboard_data(db, {"date_from": date_from, "date_to": date_to, "camera_id": camera_id, "camera_name": camera_name, "direction": direction})


@router.get("")
def list_reports(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    return [_report_dict(report) for report in db.query(ScheduledReport).order_by(ScheduledReport.id.desc()).all()]


@router.post("")
def create_report(request: Request, data: dict, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Report name is required")
    report_type, fmt, recipients, settings = _validate_report_input(data)
    report = ScheduledReport(name=name, report_type=report_type, format=fmt, schedule_cron=(data.get("schedule_cron") or "0 8 * * 1").strip(), recipients=json.dumps(recipients), settings=json.dumps(settings), is_active=1 if data.get("is_active", True) else 0)
    if len(report.schedule_cron.split()) != 5:
        raise HTTPException(400, "schedule_cron must be a valid 5-field cron expression")
    db.add(report)
    db.commit()
    db.refresh(report)
    add_audit_log(db, current_user, "REPORT_CREATED", "report", report.id, f"Created: {report.name}", request.client.host if request.client else None)
    return {"ok": True, "report": _report_dict(report)}


@router.patch("/{report_id}")
def update_report(request: Request, report_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    report = db.get(ScheduledReport, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    merged = {
        "report_type": data.get("report_type", report.report_type), "format": data.get("format", report.format),
        "recipients": data.get("recipients", json.loads(report.recipients or "[]")), "settings": data.get("settings", normalize_settings(report.settings)),
    }
    report_type, fmt, recipients, settings = _validate_report_input(merged)
    if "name" in data:
        report.name = (data["name"] or "").strip() or report.name
    report.report_type, report.format, report.recipients, report.settings = report_type, fmt, json.dumps(recipients), json.dumps(settings)
    if "schedule_cron" in data:
        cron = (data["schedule_cron"] or "").strip()
        if len(cron.split()) != 5:
            raise HTTPException(400, "schedule_cron must be a valid 5-field cron expression")
        report.schedule_cron = cron
    if "is_active" in data:
        report.is_active = 1 if data["is_active"] else 0
    db.commit()
    add_audit_log(db, current_user, "REPORT_UPDATED", "report", report.id, f"Updated: {report.name}", request.client.host if request.client else None)
    return {"ok": True, "report": _report_dict(report)}


@router.delete("/{report_id}")
def delete_report(request: Request, report_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    report = db.get(ScheduledReport, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    name = report.name
    db.delete(report)
    db.commit()
    add_audit_log(db, current_user, "REPORT_DELETED", "report", report_id, f"Deleted: {name}", request.client.host if request.client else None)
    return {"ok": True}


@router.post("/generate")
def generate_report(request: Request, data: dict, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    report_type, fmt, _, settings = _validate_report_input({**data, "recipients": data.get("recipients", ["local@report"])})
    name = (data.get("name") or REPORT_TYPES[report_type]["title"]).strip()
    filters = resolve_filters((data.get("filters") or settings.get("filters") or {}))
    try:
        run, content, filename, mime = generate_report_run(db, report_type, fmt, name, filters, initiated_by=current_user.username)
    except Exception as error:
        raise HTTPException(500, f"Report generation failed: {error}") from error
    add_audit_log(db, current_user, "REPORT_GENERATED", "report_run", run.id, f"Generated: {name}", request.client.host if request.client else None)
    return Response(content=content, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{filename}"', "X-Report-Run-Id": str(run.id)})


@router.get("/runs")
def list_report_runs(limit: int = Query(100, ge=1, le=500), report_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    query = db.query(ReportRun)
    if report_id is not None:
        query = query.filter(ReportRun.scheduled_report_id == report_id)
    return [_run_dict(run) for run in query.order_by(ReportRun.started_at.desc()).limit(limit).all()]


@router.get("/runs/{run_id}/download")
def download_report_run(run_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    run = db.get(ReportRun, run_id)
    if not run or not run.file_path:
        raise HTTPException(404, "Report file not found")
    path = Path(run.file_path).resolve()
    root = Path("exports/reports").resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "Report file is unavailable")
    return FileResponse(path, filename=run.file_name.split("_", 1)[-1] if run.file_name else path.name)


@router.post("/{report_id}/run")
def run_report_now(request: Request, report_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    report = db.get(ScheduledReport, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    background_tasks.add_task(execute_scheduled_report, report_id)
    add_audit_log(db, current_user, "REPORT_QUEUED", "report", report_id, f"Queued: {report.name}", request.client.host if request.client else None)
    return {"ok": True, "message": f"Report '{report.name}' queued"}


@router.get("/{report_id}/preview-url")
def preview_report_url(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if not db.get(ScheduledReport, report_id):
        raise HTTPException(404, "Report not found")
    exp = int(time.time()) + REPORT_PREVIEW_TTL_SECONDS
    return {"url": f"/api/reports/{report_id}/preview?{urlencode({'exp': exp, 'sig': _sign_preview_url(report_id, exp)})}", "expires_at": exp}


@router.get("/{report_id}/preview")
def preview_report(report_id: int, request: Request, token: Optional[str] = Query(None), exp: Optional[int] = Query(None), sig: Optional[str] = Query(None), db: Session = Depends(get_db)):
    user = None
    if not _verify_preview_signature(report_id, exp, sig):
        user = _require_admin_from_request(request, db, token)
    report = db.get(ScheduledReport, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    try:
        run, content, filename, mime = generate_report_run(db, report.report_type, report.format, report.name, normalize_settings(report.settings).get("filters"), report.id, user.username if user else "preview")
    except Exception as error:
        raise HTTPException(500, f"Report preview failed: {error}") from error
    return Response(content=content, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{filename}"', "X-Report-Run-Id": str(run.id)})
