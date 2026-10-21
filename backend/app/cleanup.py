"""
cleanup.py - GSC Face Analytics Pro
Automated cleanup of old events and orphaned images.

Add to main.py startup:
    from app.cleanup import start_cleanup_scheduler
    @app.on_event("startup")
    async def startup():
        start_cleanup_scheduler()
"""

import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.db import SessionLocal
from app.distributed import coordinator
from app.models import FaceEvent, Person

logger = logging.getLogger(__name__)


# ============================================================
# CONFIG (override via .env)
# ============================================================
LOW_QUALITY_RETENTION_DAYS = int(os.getenv("LOW_QUALITY_RETENTION_DAYS", "30"))
NORMAL_RETENTION_DAYS      = int(os.getenv("NORMAL_RETENTION_DAYS", "180"))
CLEANUP_INTERVAL_HOURS     = int(os.getenv("CLEANUP_INTERVAL_HOURS", "24"))
BACKEND_DIR                = Path(__file__).resolve().parents[1]
IMAGES_DIR                 = os.getenv("IMAGES_DIR", str(BACKEND_DIR / "media"))
DRY_RUN                    = os.getenv("CLEANUP_DRY_RUN", "0") == "1"


# ============================================================
# CLEANUP TASKS
# ============================================================

def cleanup_old_events():
    """Delete old face events based on retention policy."""
    db = SessionLocal()
    deleted_low = 0
    deleted_normal = 0
    image_files_deleted = 0

    try:
        now = datetime.now(timezone.utc)
        protected_paths = _person_preview_paths(db)

        # 1. Low quality - delete after LOW_QUALITY_RETENTION_DAYS
        low_q_cutoff = now - timedelta(days=LOW_QUALITY_RETENTION_DAYS)
        for event in (
            db.query(FaceEvent)
            .filter(FaceEvent.is_low_quality == 1)
            .filter(FaceEvent.created_at < low_q_cutoff)
            .yield_per(500)
        ):
            image_files_deleted += _delete_event_images(event, protected_paths)
            if not DRY_RUN:
                db.delete(event)
            deleted_low += 1

        # 2. Normal events - delete after NORMAL_RETENTION_DAYS
        normal_cutoff = now - timedelta(days=NORMAL_RETENTION_DAYS)
        for event in (
            db.query(FaceEvent)
            .filter((FaceEvent.is_low_quality == 0) | (FaceEvent.is_low_quality.is_(None)))
            .filter(FaceEvent.created_at < normal_cutoff)
            .yield_per(500)
        ):
            image_files_deleted += _delete_event_images(event, protected_paths)
            if not DRY_RUN:
                db.delete(event)
            deleted_normal += 1

        if not DRY_RUN:
            db.commit()

        logger.info(
            "%sRemoved %d low-quality, %d normal events, %d image files.",
            "(DRY RUN) " if DRY_RUN else "",
            deleted_low, deleted_normal, image_files_deleted,
        )

        return {
            "deleted_low_quality": deleted_low,
            "deleted_normal": deleted_normal,
            "image_files_deleted": image_files_deleted,
            "dry_run": DRY_RUN,
        }

    except Exception as e:
        if not DRY_RUN:
            db.rollback()
        logger.error("cleanup_old_events failed: %s", e)
        raise
    finally:
        db.close()


def _person_preview_paths(db):
    protected = set()
    for (path,) in db.query(Person.preview_image).filter(Person.preview_image.isnot(None)).yield_per(1000):
        resolved = _resolve_path(path)
        if resolved:
            protected.add(str(resolved))
    return protected


def _delete_event_images(event, protected_paths=None):
    """Delete image files associated with an event."""
    protected_paths = protected_paths or set()
    paths = [
        event.image_path,
        event.crop_image_path,
        event.original_image_path,
    ]
    count = 0
    for p in paths:
        if not p:
            continue
        try:
            full_path = _resolve_path(p)
            if (
                full_path
                and str(full_path) not in protected_paths
                and full_path.exists()
                and full_path.is_file()
            ):
                if not DRY_RUN:
                    full_path.unlink()
                count += 1
        except Exception as e:
            logger.warning("Failed to delete %s: %s", p, e)
    return count


def _resolve_path(p):
    """Convert URL/relative path to filesystem path."""
    if not p:
        return None
    if p.startswith("/"):
        p = p[1:]
    if p.startswith("media/") or p.startswith("media\\"):
        p = p[6:]

    root = Path(IMAGES_DIR).resolve()
    raw = root / p
    if raw.is_symlink():
        return None
    candidate = raw.resolve()
    if candidate != root and root not in candidate.parents:
        return None
    return candidate


def cleanup_orphaned_images():
    """Find image files in media dir that aren't referenced anywhere."""
    images_path = Path(IMAGES_DIR)
    if not images_path.exists():
        return {"orphans_deleted": 0}

    db = SessionLocal()
    try:
        # Collect all referenced paths
        referenced = set()
        referenced.update(_person_preview_paths(db))
        # Optimization: only fetch path columns to save memory
        for paths in db.query(FaceEvent.image_path, FaceEvent.crop_image_path, FaceEvent.original_image_path).yield_per(1000):
            for p in paths:
                if p:
                    resolved = _resolve_path(p)
                    if resolved:
                        referenced.add(str(resolved))

        # Scan filesystem
        orphans = 0
        for f in images_path.rglob("*"):
            if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                if str(f.resolve()) not in referenced:
                    if not DRY_RUN:
                        try:
                            f.unlink()
                        except Exception:
                            continue
                    orphans += 1

        logger.info("%sRemoved %d orphaned images.", "(DRY RUN) " if DRY_RUN else "", orphans)
        return {"orphans_deleted": orphans, "dry_run": DRY_RUN}

    finally:
        db.close()


# ============================================================
# SCHEDULER
# ============================================================

_scheduler_started = False


def _cleanup_loop():
    """Background thread loop."""
    while True:
        try:
            with coordinator.lock(
                "cleanup",
                ttl_seconds=max(3600, CLEANUP_INTERVAL_HOURS * 3600),
            ) as acquired:
                if acquired:
                    cleanup_old_events()
                    cleanup_orphaned_images()
        except Exception as e:
            logger.error("Cleanup loop error: %s", e)

        # Sleep until next run
        import time
        time.sleep(CLEANUP_INTERVAL_HOURS * 3600)


def start_cleanup_scheduler():
    """Start background cleanup thread (call from FastAPI startup)."""
    global _scheduler_started
    if _scheduler_started:
        return

    thread = threading.Thread(target=_cleanup_loop, daemon=True, name="cleanup-scheduler")
    thread.start()
    _scheduler_started = True
    logger.info(
        "Cleanup scheduler started. Low-Q retention: %dd, Normal: %dd, Interval: %dh%s",
        LOW_QUALITY_RETENTION_DAYS, NORMAL_RETENTION_DAYS, CLEANUP_INTERVAL_HOURS,
        " (DRY RUN)" if DRY_RUN else "",
    )


# Manual trigger (CLI)
if __name__ == "__main__":
    print("Running manual cleanup...")
    print(cleanup_old_events())
    print(cleanup_orphaned_images())
