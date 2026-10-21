"""Feature 5: Guard Tour — define patrol routes and track execution."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin, require_operator_or_admin
from app.db import get_db
from app.models import (
    AccessControlDevice, GuardTour, GuardTourCheckpoint,
    GuardTourExecution, GuardTourCheckpointLog, Person, User,
)
from app.utils import utc_now

router = APIRouter(prefix="/api/acs/guard-tours", tags=["acs_guard_tours"])


def _checkpoint_out(c: GuardTourCheckpoint) -> dict:
    return {
        "id": c.id, "tour_id": c.tour_id, "device_id": c.device_id,
        "device_name": c.device.name if c.device else None,
        "door_no": c.door_no,
        "sequence": c.sequence,
        # Aliases so the frontend can use either 'order' or 'sequence'
        "order": c.sequence,
        "location_name": c.location_name,
        # Alias so the frontend can use either 'name' or 'location_name'
        "name": c.location_name or "",
    }


def _tour_out(t: GuardTour, *, include_checkpoints: bool = True) -> dict:
    d = {
        "id": t.id, "name": t.name, "description": t.description,
        "schedule_cron": t.schedule_cron,
        "duration_minutes": t.duration_minutes,
        "is_active": bool(t.is_active),
        # is_ordered: stored on the model; fall back to True for legacy rows
        "is_ordered": bool(getattr(t, "is_ordered", 1)),
        "created_at": t.created_at,
    }
    if include_checkpoints:
        d["checkpoints"] = [_checkpoint_out(c) for c in (t.checkpoints or [])]
    return d


def _execution_out(e: GuardTourExecution) -> dict:
    return {
        "id": e.id, "tour_id": e.tour_id,
        "guard_person_id": e.guard_person_id,
        "guard_name": e.guard.full_name if e.guard else None,
        "started_at": e.started_at, "completed_at": e.completed_at,
        "status": e.status,
        "completion_percent": e.completion_percent,
        # Alias so the frontend can use either 'completion_pct' or 'completion_percent'
        "completion_pct": e.completion_percent,
        "notes": e.notes, "created_at": e.created_at,
        "checkpoint_logs": [
            {
                "id": cl.id, "checkpoint_id": cl.checkpoint_id,
                "location_name": cl.checkpoint.location_name if cl.checkpoint else None,
                "sequence": cl.checkpoint.sequence if cl.checkpoint else None,
                "scanned_at": cl.scanned_at, "is_completed": bool(cl.is_completed),
            }
            for cl in (e.checkpoint_logs or [])
        ],
    }


# ── Tours CRUD ────────────────────────────────────────────────────────────────

@router.get("")
def list_tours(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tours = db.query(GuardTour).options(
        joinedload(GuardTour.checkpoints).joinedload(GuardTourCheckpoint.device)
    ).order_by(GuardTour.id).all()
    return [_tour_out(t) for t in tours]


@router.post("")
def create_tour(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not data.get("name"):
        raise HTTPException(400, "name is required")
    tour = GuardTour(
        name=data["name"].strip(),
        description=data.get("description"),
        schedule_cron=data.get("schedule_cron"),
        duration_minutes=int(data.get("duration_minutes") or 60),
        is_active=1 if data.get("is_active", True) else 0,
        # Store is_ordered flag sent by the frontend (default: True)
        **( {"is_ordered": 1 if data.get("is_ordered", True) else 0}
            if hasattr(GuardTour, "is_ordered") else {} ),
    )
    db.add(tour); db.commit(); db.refresh(tour)

    # Add checkpoints if provided
    checkpoints = data.get("checkpoints") or []
    for i, cp in enumerate(checkpoints):
        device = db.get(AccessControlDevice, cp.get("device_id"))
        if not device:
            continue
        checkpoint = GuardTourCheckpoint(
            tour_id=tour.id,
            device_id=cp["device_id"],
            door_no=int(cp.get("door_no", 1)),
            sequence=cp.get("sequence", i + 1),
            location_name=cp.get("location_name"),
        )
        db.add(checkpoint)
    db.commit()

    tour = db.query(GuardTour).options(
        joinedload(GuardTour.checkpoints).joinedload(GuardTourCheckpoint.device)
    ).filter(GuardTour.id == tour.id).first()
    return _tour_out(tour)


@router.patch("/{tour_id}")
def update_tour(
    tour_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    tour = db.get(GuardTour, tour_id)
    if not tour:
        raise HTTPException(404, "Tour not found")
    for field in ("name", "description", "schedule_cron", "duration_minutes", "is_active"):
        if field in data:
            setattr(tour, field, data[field] if field != "is_active" else (1 if data[field] else 0))
    db.commit(); db.refresh(tour)
    return _tour_out(tour, include_checkpoints=False)


@router.delete("/{tour_id}")
def delete_tour(
    tour_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    tour = db.get(GuardTour, tour_id)
    if not tour:
        raise HTTPException(404, "Tour not found")
    db.delete(tour); db.commit()
    return {"ok": True}


# ── Checkpoints ───────────────────────────────────────────────────────────────

@router.post("/{tour_id}/checkpoints")
def add_checkpoint(
    tour_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    tour = db.get(GuardTour, tour_id)
    if not tour:
        raise HTTPException(404, "Tour not found")
    device = db.get(AccessControlDevice, data.get("device_id"))
    if not device:
        raise HTTPException(404, "ACS device not found")
    cp = GuardTourCheckpoint(
        tour_id=tour_id,
        device_id=data["device_id"],
        door_no=int(data.get("door_no", 1)),
        # Accept 'order' as alias for 'sequence' (frontend uses 'order')
        sequence=int(data.get("sequence") or data.get("order") or 1),
        # Accept 'name' as alias for 'location_name' (frontend uses 'name')
        location_name=data.get("location_name") or data.get("name"),
    )
    db.add(cp); db.commit(); db.refresh(cp)
    cp.device = device
    return _checkpoint_out(cp)


@router.delete("/{tour_id}/checkpoints/{cp_id}")
def delete_checkpoint(
    tour_id: int, cp_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cp = db.query(GuardTourCheckpoint).filter(
        GuardTourCheckpoint.id == cp_id,
        GuardTourCheckpoint.tour_id == tour_id,
    ).first()
    if not cp:
        raise HTTPException(404, "Checkpoint not found")
    db.delete(cp); db.commit()
    return {"ok": True}


# ── Executions ────────────────────────────────────────────────────────────────

@router.get("/{tour_id}/executions")
def list_executions(
    tour_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    execs = (
        db.query(GuardTourExecution)
        .options(
            joinedload(GuardTourExecution.guard),
            joinedload(GuardTourExecution.checkpoint_logs)
            .joinedload(GuardTourCheckpointLog.checkpoint),
        )
        .filter(GuardTourExecution.tour_id == tour_id)
        .order_by(GuardTourExecution.created_at.desc())
        .limit(limit).all()
    )
    return [_execution_out(e) for e in execs]


@router.post("/{tour_id}/executions")
def start_execution(
    tour_id: int, data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    tour = db.query(GuardTour).options(
        joinedload(GuardTour.checkpoints)
    ).filter(GuardTour.id == tour_id).first()
    if not tour:
        raise HTTPException(404, "Tour not found")

    execution = GuardTourExecution(
        tour_id=tour_id,
        guard_person_id=data.get("guard_person_id"),
        started_at=utc_now(),
        status="in_progress",
    )
    db.add(execution); db.flush()

    for cp in tour.checkpoints:
        log = GuardTourCheckpointLog(
            execution_id=execution.id,
            checkpoint_id=cp.id,
            is_completed=0,
        )
        db.add(log)
    db.commit()

    exec_full = db.query(GuardTourExecution).options(
        joinedload(GuardTourExecution.guard),
        joinedload(GuardTourExecution.checkpoint_logs)
        .joinedload(GuardTourCheckpointLog.checkpoint),
    ).filter(GuardTourExecution.id == execution.id).first()
    return _execution_out(exec_full)


@router.post("/executions/{exec_id}/scan/{checkpoint_id}")
def scan_checkpoint(
    exec_id: int, checkpoint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    log = db.query(GuardTourCheckpointLog).filter(
        GuardTourCheckpointLog.execution_id == exec_id,
        GuardTourCheckpointLog.checkpoint_id == checkpoint_id,
    ).first()
    if not log:
        raise HTTPException(404, "Checkpoint log not found")

    if log.is_completed:
        raise HTTPException(409, "Checkpoint already scanned")

    # ── is_ordered enforcement ────────────────────────────────────────────────
    execution_full = (
        db.query(GuardTourExecution)
        .options(
            joinedload(GuardTourExecution.tour).joinedload(GuardTour.checkpoints),
            joinedload(GuardTourExecution.checkpoint_logs),
        )
        .filter(GuardTourExecution.id == exec_id)
        .first()
    )
    tour = execution_full.tour if execution_full else None
    if tour and getattr(tour, "is_ordered", 1):
        # Build {checkpoint_id: sequence} map
        seq_map = {cp.id: cp.sequence for cp in (tour.checkpoints or [])}
        target_seq = seq_map.get(checkpoint_id)
        if target_seq is not None:
            # Minimum sequence among not-yet-completed logs
            pending_seqs = [
                seq_map[cl.checkpoint_id]
                for cl in execution_full.checkpoint_logs
                if not cl.is_completed and cl.checkpoint_id in seq_map
            ]
            if pending_seqs and target_seq > min(pending_seqs):
                min_seq = min(pending_seqs)
                raise HTTPException(
                    422,
                    f"Out-of-order scan: complete checkpoint #{min_seq} first "
                    f"(attempted #{target_seq})"
                )
    # ─────────────────────────────────────────────────────────────────────────

    log.is_completed = 1
    log.scanned_at   = utc_now()
    db.commit()

    # Recalculate completion %
    execution = db.query(GuardTourExecution).options(
        joinedload(GuardTourExecution.checkpoint_logs)
    ).filter(GuardTourExecution.id == exec_id).first()
    total     = len(execution.checkpoint_logs)
    completed = sum(1 for cl in execution.checkpoint_logs if cl.is_completed)
    execution.completion_percent = round(completed / total * 100, 1) if total else 0
    if completed == total:
        execution.status       = "completed"
        execution.completed_at = utc_now()
    db.commit()

    return {
        "ok": True,
        "completion_percent": execution.completion_percent,
        "completion_pct":     execution.completion_percent,
        "status":             execution.status,
    }
