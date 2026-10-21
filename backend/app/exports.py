"""
exports.py - GSC Face Analytics Pro
PDF and Excel export utilities.

Requirements:
    pip install reportlab openpyxl

Add to main.py:
    from app.exports import router as exports_router
    app.include_router(exports_router)
"""

import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.auth import require_operator_or_admin
from app.models import FaceEvent, Person


router = APIRouter(prefix="/api/exports", tags=["exports"])


# ============================================================
# EXCEL EXPORTS
# ============================================================

@router.get("/persons.xlsx")
def export_persons_excel(
    person_type: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(require_operator_or_admin),
):
    """Export all persons as Excel (.xlsx)."""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment
    except ImportError:
        raise HTTPException(500, "openpyxl not installed. Run: pip install openpyxl")

    q = db.query(Person).filter(Person.source != "acs")
    if person_type:
        q = q.filter(Person.person_type == person_type)
    persons = q.order_by(Person.id.desc()).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Persons"

    headers = [
        "ID", "Full Name", "Type", "Department", "Phone",
        "Seen Count", "First Seen", "Last Seen", "Notes"
    ]
    ws.append(headers)

    header_fill = PatternFill("solid", fgColor="2563EB")
    header_font = Font(color="FFFFFF", bold=True, size=11)
    for col in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")

    for p in persons:
        ws.append([
            p.id,
            p.full_name or "",
            (p.person_type or "unknown").upper(),
            p.department or "",
            p.phone or "",
            p.seen_count or 0,
            p.first_seen.strftime("%Y-%m-%d %H:%M") if p.first_seen else "",
            p.last_seen.strftime("%Y-%m-%d %H:%M") if p.last_seen else "",
            p.notes or "",
        ])

    widths = [8, 28, 14, 22, 18, 14, 20, 20, 40]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + i)].width = w

    ws.row_dimensions[1].height = 26
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"persons_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/attendance.xlsx")
def export_attendance_excel(
    days: int = Query(7, ge=1, le=365),
    db: Session = Depends(get_db),
    user=Depends(require_operator_or_admin),
):
    """Export attendance for last N days as Excel."""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment
    except ImportError:
        raise HTTPException(500, "openpyxl not installed.")

    since = datetime.now(timezone.utc) - timedelta(days=days)
    events = (
        db.query(FaceEvent)
        .filter(
            FaceEvent.source == "face_analytics",
            FaceEvent.created_at >= since,
        )
        .order_by(FaceEvent.created_at.desc())
        .all()
    )

    wb = Workbook()
    ws = wb.active
    ws.title = f"Attendance ({days}d)"

    headers = [
        "ID", "Date", "Time", "Person", "Type",
        "Camera", "Confidence %", "Quality", "Low Q", "Reason"
    ]
    ws.append(headers)

    header_fill = PatternFill("solid", fgColor="2563EB")
    header_font = Font(color="FFFFFF", bold=True, size=11)
    for col in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill = header_fill
        cell.font = header_font

    for e in events:
        ts = e.created_at
        person_name = (e.person.full_name if e.person else None) or f"Unknown #{e.person_id or '?'}"
        person_type = ((e.person.person_type if e.person else None) or "unknown").upper()

        ws.append([
            e.id,
            ts.strftime("%Y-%m-%d") if ts else "",
            ts.strftime("%H:%M:%S") if ts else "",
            person_name,
            person_type,
            e.camera_name or "",
            round(e.confidence * 100, 1) if e.confidence else "",
            round(e.face_quality, 2) if e.face_quality else "",
            "YES" if e.is_low_quality else "",
            e.quality_reason or "",
        ])

    widths = [8, 12, 12, 28, 12, 22, 14, 12, 8, 28]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + i)].width = w

    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"attendance_{days}d_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============================================================
# PDF EXPORTS
# ============================================================

@router.get("/attendance.pdf")
def export_attendance_pdf(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    user=Depends(require_operator_or_admin),
):
    """Export attendance summary as PDF."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
        )
    except ImportError:
        raise HTTPException(500, "reportlab not installed. Run: pip install reportlab")

    since = datetime.now(timezone.utc) - timedelta(days=days)
    events = (
        db.query(FaceEvent)
        .filter(
            FaceEvent.source == "face_analytics",
            FaceEvent.created_at >= since,
        )
        .order_by(FaceEvent.created_at.desc())
        .limit(500)
        .all()
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.2 * cm, rightMargin=1.2 * cm,
        topMargin=1.2 * cm, bottomMargin=1.2 * cm,
        title=f"Attendance Report ({days} days)",
        author="GSC Face Analytics Pro",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontSize=18, textColor=colors.HexColor("#0b1220"),
        alignment=0, spaceAfter=4,
    )
    sub_style = ParagraphStyle(
        "Sub", parent=styles["Normal"],
        fontSize=10, textColor=colors.HexColor("#64748b"),
        spaceAfter=14,
    )

    story = [
        Paragraph("GSC Face Analytics Pro - Attendance Report", title_style),
        Paragraph(
            f"Last {days} days &middot; Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} &middot; "
            f"User: {user.username}",
            sub_style,
        ),
    ]

    # Summary
    total = len(events)
    unique = len({e.person_id for e in events if e.person_id})
    low_q = sum(1 for e in events if e.is_low_quality)

    summary_data = [
        ["Total Events", "Unique Persons", "Low Quality"],
        [str(total), str(unique), str(low_q)],
    ]
    summary = Table(summary_data, colWidths=[5.5 * cm] * 3)
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563EB")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTSIZE", (0, 1), (-1, 1), 18),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    story.append(summary)
    story.append(Spacer(1, 0.6 * cm))

    # Events table
    table_data = [["Date/Time", "Person", "Type", "Camera", "Match %"]]
    for e in events[:200]:
        ts = e.created_at.strftime("%Y-%m-%d %H:%M") if e.created_at else "-"
        name = (e.person.full_name if e.person else None) or f"Unknown #{e.person_id or '?'}"
        ptype = ((e.person.person_type if e.person else None) or "unknown").upper()
        cam = e.camera_name or "-"
        conf = f"{round(e.confidence * 100, 1)}%" if e.confidence else "-"
        table_data.append([ts, name[:24], ptype, cam[:18], conf])

    events_table = Table(
        table_data,
        colWidths=[3.5 * cm, 5 * cm, 2.5 * cm, 4 * cm, 2 * cm],
        repeatRows=1,
    )
    events_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 7.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafbfd")]),
        ("ALIGN", (4, 1), (4, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(events_table)

    doc.build(story)
    buf.seek(0)

    filename = f"attendance_{days}d_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/persons.pdf")
def export_persons_pdf(
    person_type: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(require_operator_or_admin),
):
    """Export persons list as PDF."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        )
    except ImportError:
        raise HTTPException(500, "reportlab not installed.")

    q = db.query(Person).filter(Person.source != "acs")
    if person_type:
        q = q.filter(Person.person_type == person_type)
    persons = q.order_by(Person.id.desc()).all()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.2 * cm, rightMargin=1.2 * cm,
        topMargin=1.2 * cm, bottomMargin=1.2 * cm,
    )

    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "T", parent=styles["Title"], fontSize=18, alignment=0,
        textColor=colors.HexColor("#0b1220"), spaceAfter=4,
    )
    sub = ParagraphStyle(
        "S", parent=styles["Normal"], fontSize=10,
        textColor=colors.HexColor("#64748b"), spaceAfter=14,
    )

    story = [
        Paragraph("GSC Face Analytics Pro - Persons Database", title),
        Paragraph(
            f"{len(persons)} persons &middot; Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            sub,
        ),
    ]

    table_data = [["ID", "Name", "Type", "Department", "Phone", "Seen"]]
    for p in persons:
        table_data.append([
            str(p.id),
            (p.full_name or "-")[:28],
            (p.person_type or "unknown").upper(),
            (p.department or "-")[:20],
            (p.phone or "-")[:16],
            str(p.seen_count or 0),
        ])

    t = Table(
        table_data,
        colWidths=[1.5 * cm, 5 * cm, 2.5 * cm, 4 * cm, 3.5 * cm, 1.5 * cm],
        repeatRows=1,
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafbfd")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)

    doc.build(story)
    buf.seek(0)

    filename = f"persons_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
