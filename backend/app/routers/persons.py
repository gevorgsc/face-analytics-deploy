"""Persons router - register, CRUD, history, merge, face update."""

import json
import logging
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.faiss_engine import mark_faiss_dirty
from app.models import FaceEvent, Person, User
from app.pagination import normalize_pagination
from app.schemas import PersonOut, PersonUpdate
from app.utils import (
    add_audit_log,
    crop_face_preview,
    diff_snapshot,
    extract_faces_async,
    full_media_path,
    model_snapshot,
    read_limited,
    save_bytes_to_media,
    sign_media_collection,
    sign_media_fields,
    upsert_person_for_face,
    utc_now,
    yerevan_day_start_utc,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["persons"])
FACE_ANALYTICS_SOURCE = "face_analytics"


@router.get("/api/persons", response_model=List[PersonOut])
def list_persons(
    response: Response,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None, description="Search by name, department, phone"),
    person_type: Optional[str] = Query(None, description="employee|vip|blacklist"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List registered persons with pagination, search, and type filter."""
    q = (
        db.query(Person)
        .filter(Person.full_name.isnot(None))
        .filter(Person.person_type != "unknown")
        .filter(Person.source != "acs")
    )
    if person_type:
        q = q.filter(Person.person_type == person_type)
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Person.full_name.ilike(term),
                Person.department.ilike(term),
                Person.phone.ilike(term),
                Person.employee_no.ilike(term),
            )
        )
    total = q.count()
    page = normalize_pagination(limit, offset)
    items = (
        q.order_by(Person.last_seen.desc())
        .offset(page.offset)
        .limit(page.limit)
        .all()
    )
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Limit"] = str(page.limit)
    response.headers["X-Offset"] = str(page.offset)
    return sign_media_collection(items)


@router.get("/api/unknowns", response_model=List[PersonOut])
def list_unknowns(
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return sign_media_collection(
        db.query(Person)
        .filter(Person.person_type == "unknown")
        .filter(Person.face_embedding.isnot(None))
        .filter(Person.source != "acs")
        .order_by(Person.seen_count.desc(), Person.last_seen.desc())
        .limit(limit)
        .all()
    )


@router.post("/api/persons/register", response_model=PersonOut)
async def register_person(
    request: Request,
    files: List[UploadFile] = File(...),
    full_name: str = Form(...),
    person_type: str = Form("employee"),
    department: str = Form(""),
    phone: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    if len(files) > 5:
        raise HTTPException(400, "Maximum 5 photos allowed")

    all_embeddings = []
    first_preview = None

    for i, file in enumerate(files):
        data = await read_limited(file)
        img_path = save_bytes_to_media(data, "registered_person")
        image_full_path = full_media_path(img_path)
        faces = await extract_faces_async(image_full_path)
        if not faces:
            if i == 0:
                raise HTTPException(400, "No face found in first uploaded image")
            continue
        all_embeddings.append(faces[0]["embedding"])
        if first_preview is None:
            first_preview = crop_face_preview(image_full_path, faces[0]["bbox"], "registered_crop") or img_path

    if not all_embeddings:
        raise HTTPException(400, "No face found in any uploaded image")

    import numpy as np
    if len(all_embeddings) == 1:
        avg_embedding = all_embeddings[0]
    else:
        avg = np.mean(np.stack(all_embeddings), axis=0)
        norm = np.linalg.norm(avg)
        avg_embedding = avg / norm if norm > 0 else avg

    embedding_json = json.dumps(avg_embedding.tolist())

    person = Person(
        full_name=full_name,
        person_type=person_type,
        department=department,
        phone=phone,
        notes=notes,
        preview_image=first_preview,
        face_embedding=embedding_json,
        first_seen=utc_now(),
        last_seen=utc_now(),
        seen_count=0,
        source="fa",
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    mark_faiss_dirty()

    add_audit_log(
        db, current_user, "PERSON_CREATED", "person", person.id,
        f"Created person: {person.full_name} / type: {person.person_type} / {len(all_embeddings)} photo(s)",
        request.client.host if request.client else None,
    )

    return sign_media_fields(person)


@router.post("/api/persons/register-from-event/{event_id}", response_model=PersonOut)
async def register_from_event(
    request: Request,
    event_id: int,
    full_name: str = Form(...),
    person_type: str = Form("employee"),
    department: str = Form(""),
    phone: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    event = db.get(FaceEvent, event_id)
    if not event:
        raise HTTPException(404, "Event not found")

    image_path = event.original_image_path or event.image_path
    image_full_path = full_media_path(image_path)
    faces = await extract_faces_async(image_full_path)
    if not faces:
        raise HTTPException(400, "No face found in selected event image")

    embedding = faces[0]["embedding"]
    embedding_json = json.dumps(embedding.tolist())
    preview = crop_face_preview(image_full_path, faces[0]["bbox"], "event_crop") or event.crop_image_path or image_path

    person = Person(
        full_name=full_name,
        person_type=person_type,
        department=department,
        phone=phone,
        notes=notes,
        preview_image=preview,
        face_embedding=embedding_json,
        first_seen=utc_now(),
        last_seen=utc_now(),
        seen_count=0,
    )
    db.add(person)
    db.commit()
    db.refresh(person)

    event.person_id = person.id
    db.commit()
    mark_faiss_dirty()

    add_audit_log(
        db, current_user, "PERSON_CREATED", "person", person.id,
        f"Created person from event: {person.full_name} / type: {person.person_type}",
        request.client.host if request.client else None,
    )

    return sign_media_fields(person)


@router.get("/api/persons/{person_id}/history")
def person_history(
    person_id: int,
    limit: int = 100,
    offset: int = 0,
    include_stats: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")

    page = normalize_pagination(limit, offset)
    event_filters = (
        FaceEvent.person_id == person_id,
        FaceEvent.source == FACE_ANALYTICS_SOURCE,
    )
    event_query = db.query(FaceEvent).filter(*event_filters)
    total_events = event_query.count()
    events = (
        event_query
        .order_by(FaceEvent.created_at.desc())
        .offset(page.offset)
        .limit(page.limit)
        .all()
    )

    stats = None
    if include_stats:
        camera_rows = (
            db.query(FaceEvent.camera_name, func.count(FaceEvent.id))
            .filter(*event_filters)
            .group_by(FaceEvent.camera_name)
            .order_by(func.count(FaceEvent.id).desc())
            .all()
        )
        today_start = yerevan_day_start_utc()
        week_start = utc_now() - timedelta(days=7)
        stats = {
            "total_events": total_events,
            "today_events": event_query.filter(FaceEvent.created_at >= today_start).count(),
            "last_7_days": event_query.filter(FaceEvent.created_at >= week_start).count(),
            "low_quality_events": event_query.filter(FaceEvent.is_low_quality == 1).count(),
            "unique_cameras": len(camera_rows),
            "camera_counts": [
                {"camera": camera or "Unknown Camera", "count": count}
                for camera, count in camera_rows
            ],
        }

    person_name = person.full_name or getattr(person, "unknown_label", None) or f"Unknown #{person.id}"

    return {
        "person": sign_media_fields({
            "id": person.id,
            "full_name": person.full_name,
            "display_name": person_name,
            "person_type": person.person_type,
            "department": person.department,
            "phone": person.phone,
            "notes": person.notes,
            "preview_image": person.preview_image,
            "seen_count": person.seen_count,
            "first_seen": person.first_seen,
            "last_seen": person.last_seen,
        }),
        "stats": stats,
        "pagination": {
            "limit": page.limit,
            "offset": page.offset,
            "returned": len(events),
            "has_more": page.offset + len(events) < total_events,
        },
        "events": sign_media_collection([
            {
                "id": e.id,
                "person_id": e.person_id,
                "camera_ip": e.camera_ip,
                "camera_name": e.camera_name,
                "event_type": e.event_type,
                "image_path": e.image_path,
                "crop_image_path": e.crop_image_path,
                "original_image_path": e.original_image_path,
                "confidence": e.confidence,
                "face_quality": getattr(e, "face_quality", None),
                "quality_reason": getattr(e, "quality_reason", None),
                "is_low_quality": getattr(e, "is_low_quality", 0),
                "age": getattr(e, "age", None),
                "gender": getattr(e, "gender", None),
                "created_at": e.created_at,
                "face_index": getattr(e, "face_index", None),
                "face_count": getattr(e, "face_count", None),
            }
            for e in events
        ]),
    }


@router.patch("/api/persons/{person_id}", response_model=PersonOut)
def update_person(
    request: Request,
    person_id: int,
    data: PersonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    before = model_snapshot(person, ["full_name", "person_type", "department", "phone", "notes", "preview_image"])

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(person, k, v)

    db.commit()
    db.refresh(person)
    mark_faiss_dirty()

    after = model_snapshot(person, list(before.keys()))
    changes = diff_snapshot(before, after)
    add_audit_log(
        db, current_user, "PERSON_UPDATED", "person", person.id,
        json.dumps({"person": person.full_name, "changes": changes}, default=str),
        request.client.host if request.client else None,
    )

    return sign_media_fields(person)


@router.post("/api/persons/{person_id}/merge/{source_id}")
def merge_persons(
    request: Request,
    person_id: int,
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    if person_id == source_id:
        raise HTTPException(400, "Cannot merge a person with themselves")

    target = db.get(Person, person_id)
    source = db.get(Person, source_id)
    if not target or not source:
        raise HTTPException(404, "Person not found")

    moved = db.query(FaceEvent).filter(FaceEvent.person_id == source_id).update(
        {"person_id": person_id}, synchronize_session=False
    )

    target.seen_count = (target.seen_count or 0) + (source.seen_count or 0)
    if source.first_seen and (not target.first_seen or source.first_seen < target.first_seen):
        target.first_seen = source.first_seen
    if source.last_seen and (not target.last_seen or source.last_seen > target.last_seen):
        target.last_seen = source.last_seen

    source_name = source.full_name or getattr(source, "unknown_label", None) or f"Unknown #{source.id}"
    db.delete(source)
    db.commit()
    mark_faiss_dirty()

    add_audit_log(
        db, current_user, "PERSON_MERGED", "person", person_id,
        f"Merged #{source_id} ({source_name}) into #{person_id} ({target.full_name}). Events moved: {moved}",
        request.client.host if request.client else None,
    )

    return {"ok": True, "events_moved": moved, "target_id": person_id}


@router.post("/api/persons/{person_id}/update-face", response_model=PersonOut)
async def update_person_face(
    request: Request,
    person_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    data = await read_limited(file)
    img_path = save_bytes_to_media(data, "face_update")
    image_full_path = full_media_path(img_path)

    faces = await extract_faces_async(image_full_path)
    if not faces:
        raise HTTPException(400, "No face found in uploaded image")

    embedding = faces[0]["embedding"]
    preview = crop_face_preview(image_full_path, faces[0]["bbox"], "face_update_crop") or img_path

    person.face_embedding = json.dumps(embedding.tolist())
    person.preview_image = preview
    db.commit()
    db.refresh(person)
    mark_faiss_dirty()

    add_audit_log(
        db, current_user, "PERSON_FACE_UPDATED", "person", person.id,
        f"Updated face for: {person.full_name}",
        request.client.host if request.client else None,
    )

    return sign_media_fields(person)


@router.get("/api/persons/{person_id}/journey")
def person_journey(
    person_id: int,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cross-camera timeline - person's movement across cameras over time."""
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    events = (
        db.query(FaceEvent)
        .filter(
            FaceEvent.person_id == person_id,
            FaceEvent.source == FACE_ANALYTICS_SOURCE,
        )
        .order_by(FaceEvent.created_at.asc())
        .limit(limit)
        .all()
    )

    # Group into camera-hop segments
    hops = []
    for ev in events:
        hop = {
            "event_id":    ev.id,
            "camera_name": ev.camera_name or "Unknown",
            "camera_ip":   ev.camera_ip,
            "direction":   ev.direction,
            "confidence":  ev.confidence,
            "created_at":  ev.created_at,
            "image_path":  ev.image_path,
            "crop_image_path": ev.crop_image_path,
        }
        hops.append(hop)

    return {
        "person_id":  person_id,
        "full_name":  person.full_name or f"Unknown #{person_id}",
        "total_hops": len(hops),
        "hops":       sign_media_collection(hops),
    }


@router.post("/api/persons/import")
async def bulk_import_persons(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    """
    CSV bulk import. Expected columns (header row required):
    full_name, person_type, department, phone, notes
    person_type must be one of: employee, vip, blacklist, unknown
    """
    import csv, io

    data = await read_limited(file, max_bytes=2 * 1024 * 1024, require_image=False)
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    required = {"full_name"}
    if not reader.fieldnames or not required.issubset({f.strip().lower() for f in reader.fieldnames}):
        raise HTTPException(400, "CSV must have at least a 'full_name' column")

    valid_types = {"employee", "vip", "blacklist", "unknown"}
    created, skipped, errors = [], [], []

    for i, row in enumerate(reader, start=2):
        name = (row.get("full_name") or row.get("Full Name") or "").strip()
        if not name:
            skipped.append({"row": i, "reason": "empty full_name"})
            continue

        ptype = (row.get("person_type") or row.get("Person Type") or "employee").strip().lower()
        if ptype not in valid_types:
            ptype = "employee"

        try:
            person = Person(
                full_name   = name,
                person_type = ptype,
                department  = (row.get("department") or row.get("Department") or "").strip() or None,
                phone       = (row.get("phone") or row.get("Phone") or "").strip() or None,
                notes       = (row.get("notes") or row.get("Notes") or "").strip() or None,
            )
            db.add(person)
            db.flush()
            created.append({"row": i, "id": person.id, "name": name})
        except Exception as e:
            db.rollback()
            errors.append({"row": i, "name": name, "error": str(e)})

    try:
        db.commit()
        mark_faiss_dirty()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Commit failed: {e}")

    add_audit_log(
        db, current_user, "BULK_IMPORT", "persons", None,
        f"Imported {len(created)} persons, skipped {len(skipped)}, errors {len(errors)}",
        request.client.host if request.client else None,
    )

    return {
        "ok":      True,
        "created": len(created),
        "skipped": len(skipped),
        "errors":  len(errors),
        "rows":    created,
        "error_rows": errors,
    }


@router.delete("/api/persons/{person_id}")
def delete_person(
    request: Request,
    person_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    deleted_name = person.full_name
    db.query(FaceEvent).filter(FaceEvent.person_id == person.id).update({"person_id": None})
    db.delete(person)
    db.commit()
    mark_faiss_dirty()

    add_audit_log(
        db, current_user, "PERSON_DELETED", "person", person_id,
        f"Deleted person: {deleted_name}",
        request.client.host if request.client else None,
    )

    return {"ok": True}
