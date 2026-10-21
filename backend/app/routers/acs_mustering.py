"""Feature 6: Mustering / Evacuation Report — who is inside the building right now."""

import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.db import get_db
from app.models import AcsAccessEvent, AccessControlDevice, Person, User
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/mustering", tags=["acs_mustering"])


def _yerevan_today() -> str:
    import zoneinfo
    tz = zoneinfo.ZoneInfo("Asia/Yerevan")
    return datetime.now(tz).strftime("%Y-%m-%d")


def _compute_occupancy(db: Session, since_hours: int = 24) -> list[dict]:
    """
    Derive who is currently inside based on last ACS direction event.
    A person is 'inside' if their last event of the day has direction='in'.
    """
    cutoff = utc_now() - timedelta(hours=since_hours)

    # Latest event per person with a direction tag
    subq = (
        db.query(
            AcsAccessEvent.person_id,
            func.max(AcsAccessEvent.created_at).label("last_at"),
        )
        .filter(
            AcsAccessEvent.created_at >= cutoff,
            AcsAccessEvent.person_id.isnot(None),
            AcsAccessEvent.direction.isnot(None),
            AcsAccessEvent.event_type == "access_granted",
        )
        .group_by(AcsAccessEvent.person_id)
        .subquery()
    )

    rows = (
        db.query(AcsAccessEvent)
        .join(subq, (AcsAccessEvent.person_id == subq.c.person_id) &
                    (AcsAccessEvent.created_at == subq.c.last_at))
        .options(
            joinedload(AcsAccessEvent.person),
            joinedload(AcsAccessEvent.device),
        )
        .all()
    )

    inside = []
    for ev in rows:
        if ev.direction == "in":
            # Resolve card_number from person or event
            card_number = (
                ev.card_number
                or (ev.person.card_number if ev.person else None)
            )
            inside.append({
                "person_id":        ev.person_id,
                "person_name":      ev.person.full_name if ev.person else "Unknown",
                "person_type":      ev.person.person_type if ev.person else None,
                "department":       ev.person.department if ev.person else None,
                "card_number":      card_number,
                # Expose both field names so old callers and the new frontend both work
                "last_seen_at":     ev.created_at,
                "last_event_at":    ev.created_at,
                "last_device_name": ev.device.name if ev.device else None,
                "last_door_no":     ev.door_no,
            })
    return inside


def _count_today_events(db: Session, direction: str) -> int:
    """Count access_granted events with the given direction that happened today (UTC)."""
    today_start = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(AcsAccessEvent)
        .filter(
            AcsAccessEvent.created_at >= today_start,
            AcsAccessEvent.event_type == "access_granted",
            AcsAccessEvent.direction == direction,
        )
        .count()
    )


@router.get("/snapshot")
def mustering_snapshot(
    since_hours: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Current occupancy snapshot — who is inside right now."""
    inside = _compute_occupancy(db, since_hours)
    entries_today = _count_today_events(db, "in")
    exits_today   = _count_today_events(db, "out")
    return {
        "total_inside":   len(inside),
        "computed_at":    utc_now(),
        "since_hours":    since_hours,
        # Frontend expects 'persons_inside'; keep 'persons' for backward compat
        "persons_inside": inside,
        "persons":        inside,
        "entries_today":  entries_today,
        "exits_today":    exits_today,
    }


@router.get("/evacuation-report")
def evacuation_report(
    since_hours: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full evacuation roster — grouped by department."""
    inside = _compute_occupancy(db, since_hours)
    by_dept: dict = {}
    for p in inside:
        dept = p.get("department") or "Unassigned"
        by_dept.setdefault(dept, []).append(p)

    return {
        "total_inside":   len(inside),
        "generated_at":   utc_now(),
        "by_department":  [
            {"department": dept, "count": len(persons), "persons": persons}
            for dept, persons in sorted(by_dept.items())
        ],
    }


@router.get("/evacuation-report/pdf")
def evacuation_report_pdf(
    since_hours: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Evacuation roster as a professional PDF — grouped by department."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph,
            Spacer, HRFlowable,
        )
    except ImportError:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={"detail": "reportlab not installed — PDF export unavailable"},
        )

    inside  = _compute_occupancy(db, since_hours)
    by_dept: dict = {}
    for p in inside:
        dept = p.get("department") or "Unassigned"
        by_dept.setdefault(dept, []).append(p)

    buf  = io.BytesIO()
    doc  = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=1.5 * cm, leftMargin=1.5 * cm,
        topMargin=2 * cm, bottomMargin=1.5 * cm,
        title="Evacuation Roster",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title2", parent=styles["Title"],
        fontSize=18, spaceAfter=4, textColor=colors.HexColor("#1e293b"),
    )
    sub_style = ParagraphStyle(
        "Sub", parent=styles["Normal"],
        fontSize=9, textColor=colors.HexColor("#64748b"), spaceAfter=12,
    )
    dept_style = ParagraphStyle(
        "DeptHead", parent=styles["Heading2"],
        fontSize=11, spaceBefore=14, spaceAfter=4,
        textColor=colors.HexColor("#1d4ed8"),
    )

    generated_at = utc_now().strftime("%Y-%m-%d %H:%M UTC")
    elements = [
        Paragraph("🏢 Evacuation Roster", title_style),
        Paragraph(
            f"Generated: {generated_at} &nbsp;|&nbsp; "
            f"Window: last {since_hours}h &nbsp;|&nbsp; "
            f"<b>{len(inside)} person(s) inside</b>",
            sub_style,
        ),
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")),
        Spacer(1, 0.3 * cm),
    ]

    if not inside:
        elements.append(Paragraph("No persons currently inside.", styles["Normal"]))
    else:
        for dept, persons in sorted(by_dept.items()):
            elements.append(Paragraph(f"{dept}  ({len(persons)})", dept_style))

            table_data = [["#", "Name", "Card", "Last Seen", "Door"]]
            for i, p in enumerate(persons, 1):
                last = p.get("last_event_at") or p.get("last_seen_at")
                last_str = (
                    last.strftime("%m/%d %H:%M") if hasattr(last, "strftime")
                    else (str(last)[:16] if last else "—")
                )
                table_data.append([
                    str(i),
                    p.get("person_name") or "Unknown",
                    p.get("card_number") or "—",
                    last_str,
                    f"Door {p.get('last_door_no') or '—'}",
                ])

            col_widths = [1 * cm, 6 * cm, 4 * cm, 3.5 * cm, 2.5 * cm]
            tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND",  (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
                ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
                ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",    (0, 0), (-1, 0), 9),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                ("TOPPADDING",    (0, 0), (-1, 0), 6),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1),
                 [colors.HexColor("#f8fafc"), colors.white]),
                ("FONTSIZE",    (0, 1), (-1, -1), 8),
                ("TOPPADDING",  (0, 1), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            elements.append(tbl)
            elements.append(Spacer(1, 0.4 * cm))

    doc.build(elements)
    buf.seek(0)
    filename = f"evacuation_roster_{utc_now().strftime('%Y%m%d_%H%M')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/event-flow")
def event_flow(
    hours: int = Query(8, ge=1, le=72),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """IN/OUT count per hour for the last N hours."""
    cutoff = utc_now() - timedelta(hours=hours)
    events = (
        db.query(AcsAccessEvent)
        .filter(
            AcsAccessEvent.created_at >= cutoff,
            AcsAccessEvent.direction.isnot(None),
            AcsAccessEvent.event_type == "access_granted",
        )
        .all()
    )
    buckets: dict = {}
    for ev in events:
        bucket = ev.created_at.strftime("%Y-%m-%dT%H:00")
        buckets.setdefault(bucket, {"in": 0, "out": 0})
        if ev.direction == "in":
            buckets[bucket]["in"] += 1
        elif ev.direction == "out":
            buckets[bucket]["out"] += 1

    flow_list = [
        {
            "hour":    k,
            # Frontend expects 'entries'/'exits'; keep 'in'/'out' for backward compat
            "entries": v["in"],
            "exits":   v["out"],
            "in":      v["in"],
            "out":     v["out"],
        }
        for k, v in sorted(buckets.items())
    ]

    return {
        "hours":       hours,
        # Frontend expects 'hourly_flow'; keep 'flow' for backward compat
        "hourly_flow": flow_list,
        "flow":        flow_list,
    }
