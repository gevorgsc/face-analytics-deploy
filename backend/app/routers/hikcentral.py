"""HikCentral synchronization endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.hikcentral_client import (
    HikCentralClient,
    HikCentralError,
    connection_summary,
    extract_rows,
)
from app.models import Person, User
from app.utils import add_audit_log, utc_now

router = APIRouter(prefix="/api/integrations/hikcentral", tags=["hikcentral"])


def _value(row: dict, *keys):
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


@router.get("/status")
def hikcentral_status(current_user: User = Depends(get_current_user)):
    return connection_summary()


@router.post("/test")
def test_hikcentral(current_user: User = Depends(require_admin)):
    try:
        response = HikCentralClient().test()
    except HikCentralError as exc:
        raise HTTPException(502, str(exc))
    return {"ok": True, "message": response.get("msg") or "Connected"}


@router.post("/sync/people")
def sync_hikcentral_people(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    dry_run = bool(data.get("dry_run", False))
    max_pages = min(max(int(data.get("max_pages") or 50), 1), 200)
    client = HikCentralClient()
    created = updated = skipped = 0
    errors = []
    page = 1
    processed = 0
    try:
        while page <= max_pages:
            response = client.people_page(page)
            rows, total = extract_rows(response)
            if not rows:
                break
            for row in rows:
                employee_no = str(_value(row, "personCode", "employeeNo", "personId") or "").strip()
                full_name = str(_value(row, "personName", "fullName", "name") or "").strip()
                if not employee_no or not full_name:
                    skipped += 1
                    continue
                person = db.query(Person).filter(Person.employee_no == employee_no).first()
                values = {
                    "full_name": full_name,
                    "phone": _value(row, "phoneNo", "phone", "mobile"),
                    "email": _value(row, "email"),
                    "department": _value(row, "orgName", "departmentName", "department"),
                    "card_number": _value(row, "cardNo", "cardNumber"),
                    "person_type": "employee",
                    "source": "hikcentral",
                    "acs_active": 0 if str(_value(row, "status") or "1") in {"0", "disabled"} else 1,
                    "acs_sync_status": "synced",
                    "acs_sync_error": None,
                }
                if person:
                    for key, value in values.items():
                        if value is not None:
                            setattr(person, key, value)
                    updated += 1
                else:
                    db.add(Person(employee_no=employee_no, **values))
                    created += 1
                processed += 1
            if processed >= total or len(rows) < 200:
                break
            page += 1
    except HikCentralError as exc:
        db.rollback()
        raise HTTPException(502, str(exc))
    except Exception as exc:
        db.rollback()
        errors.append(str(exc))
    if dry_run:
        db.rollback()
    else:
        db.commit()
        add_audit_log(
            db, current_user, "HIKCENTRAL_PERSON_SYNC", "integration", "hikcentral",
            f"Created {created}, updated {updated}, skipped {skipped}",
        )
    return {
        "ok": not errors,
        "dry_run": dry_run,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "synced_at": utc_now(),
    }
