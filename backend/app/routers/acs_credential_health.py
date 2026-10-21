"""Credential provisioning health for Access Control persons."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.acs_person_service import (
    _person_card_numbers,
    _person_fingerprints,
    resolve_person_right_plans,
)
from app.auth import get_current_user, require_operator_or_admin
from app.db import get_db
from app.models import AccessLevelMember, CardIssue, Person, User
from app.routers.acs_person_management import _person_sync_context, _queue_person_sync

router = APIRouter(
    prefix="/api/acs/credential-health",
    tags=["acs_credential_health"],
)


def _has_face(person: Person) -> bool:
    return bool(person.preview_image)


def _person_health_row(
    person: Person,
    level_count: int,
    device_count: int,
    active_card_count: int,
    schedule_issues: list[dict] | None = None,
) -> dict:
    cards = _person_card_numbers(person)
    fingerprints = _person_fingerprints(person)
    sync_status = person.acs_sync_status or "local"
    issues = []
    if not _has_face(person):
        issues.append("missing_face")
    if not cards and active_card_count == 0:
        issues.append("missing_card")
    if not fingerprints:
        issues.append("missing_fingerprint")
    if not person.pin_code:
        issues.append("missing_pin")
    if level_count == 0:
        issues.append("missing_access_level")
    if person.acs_active and sync_status in {"error", "failed"}:
        issues.append("sync_failed")
    elif person.acs_active and sync_status == "pending":
        issues.append("sync_pending")
    schedule_issues = schedule_issues or []
    for issue_type in ("schedule_unmapped", "schedule_conflict"):
        if any(item.get("type") == issue_type for item in schedule_issues):
            issues.append(issue_type)

    return {
        "id": person.id,
        "employee_no": person.employee_no,
        "full_name": person.full_name,
        "department": person.department_ref.name if person.department_ref else person.department,
        "acs_active": bool(person.acs_active),
        "sync_status": sync_status,
        "sync_error": person.acs_sync_error,
        "has_face": _has_face(person),
        "card_count": max(len(cards), active_card_count),
        "fingerprint_count": len(fingerprints),
        "has_pin": bool(person.pin_code),
        "access_level_count": level_count,
        "device_count": device_count,
        "issues": issues,
        "schedule_issues": schedule_issues,
    }


@router.get("")
def credential_health(
    issue: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Person).filter(Person.employee_no.isnot(None))
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            Person.employee_no.ilike(term),
            Person.full_name.ilike(term),
            Person.department.ilike(term),
        ))
    persons = query.order_by(Person.full_name, Person.employee_no).limit(limit).all()
    person_ids = [person.id for person in persons]

    level_counts = {}
    device_counts = {}
    card_counts = {}
    if person_ids:
        level_counts = dict(
            db.query(AccessLevelMember.person_id, func.count(AccessLevelMember.id))
            .filter(AccessLevelMember.person_id.in_(person_ids))
            .group_by(AccessLevelMember.person_id)
            .all()
        )
        device_counts = dict(
            db.query(CardIssue.person_id, func.count(func.distinct(CardIssue.device_id)))
            .filter(
                CardIssue.person_id.in_(person_ids),
                CardIssue.status == "active",
            )
            .group_by(CardIssue.person_id)
            .all()
        )
        card_counts = dict(
            db.query(CardIssue.person_id, func.count(func.distinct(CardIssue.card_number)))
            .filter(
                CardIssue.person_id.in_(person_ids),
                CardIssue.status == "active",
                ~CardIssue.card_number.startswith("employee:"),
            )
            .group_by(CardIssue.person_id)
            .all()
        )

    rows = [
        _person_health_row(
            person,
            int(level_counts.get(person.id, 0)),
            int(device_counts.get(person.id, 0)),
            int(card_counts.get(person.id, 0)),
            resolve_person_right_plans(db, person.id)[1],
        )
        for person in persons
    ]
    all_rows = rows
    if issue:
        rows = [row for row in rows if issue in row["issues"]]

    def count(predicate):
        return sum(1 for row in all_rows if predicate(row))

    return {
        "summary": {
            "total_persons": len(all_rows),
            "active_persons": count(lambda row: row["acs_active"]),
            "configured": count(lambda row: row["sync_status"] == "synced"),
            "pending": count(lambda row: row["sync_status"] == "pending"),
            "failed": count(lambda row: row["sync_status"] in {"error", "failed"}),
            "local": count(lambda row: row["sync_status"] == "local"),
        },
        "credentials": {
            "face": {
                "configured": count(lambda row: row["has_face"]),
                "missing": count(lambda row: not row["has_face"]),
            },
            "card": {
                "configured": count(lambda row: row["card_count"] > 0),
                "missing": count(lambda row: row["card_count"] == 0),
            },
            "fingerprint": {
                "configured": count(lambda row: row["fingerprint_count"] > 0),
                "missing": count(lambda row: row["fingerprint_count"] == 0),
            },
            "pin": {
                "configured": count(lambda row: row["has_pin"]),
                "missing": count(lambda row: not row["has_pin"]),
            },
            "access_level": {
                "configured": count(lambda row: row["access_level_count"] > 0),
                "missing": count(lambda row: row["access_level_count"] == 0),
            },
        },
        "returned": len(rows),
        "persons": rows,
    }


@router.post("/retry")
async def retry_credential_sync(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    person_ids = {int(value) for value in payload.get("person_ids", []) if value}
    retry_all_failed = bool(payload.get("all_failed"))
    query = db.query(Person).filter(Person.acs_active == 1)
    if retry_all_failed:
        query = query.filter(Person.acs_sync_status.in_(["error", "failed", "pending"]))
    elif person_ids:
        query = query.filter(Person.id.in_(person_ids))
    else:
        raise HTTPException(400, "person_ids or all_failed is required")

    queued = []
    skipped = []
    for person in query.all():
        device_ids, normalized_doors, sync_photo = _person_sync_context(db, person)
        if not device_ids:
            skipped.append({
                "person_id": person.id,
                "reason": "No access level with a controller is assigned",
            })
            continue
        schedule_issues = resolve_person_right_plans(db, person.id)[1]
        if schedule_issues:
            skipped.append({
                "person_id": person.id,
                "reason": "Access schedule mapping must be fixed before synchronization",
                "schedule_issues": schedule_issues,
            })
            continue
        person.acs_sync_status = "pending"
        person.acs_sync_error = None
        _queue_person_sync(
            person,
            background_tasks,
            device_ids,
            normalized_doors,
            sync_photo,
        )
        queued.append(person.id)
    db.commit()
    return {"queued": queued, "queued_count": len(queued), "skipped": skipped}
