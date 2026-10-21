"""
backup.py - GSC Face Analytics Pro
Automated database + image backups.

Usage:
    Manual:    python -m app.backup
    Scheduled: included via start_backup_scheduler() in main.py startup

ENV:
    BACKUP_DIR              (default: ./backups)
    BACKUP_INTERVAL_HOURS   (default: 24)
    BACKUP_KEEP_COUNT       (default: 14 - keep last 14 backups)
    BACKUP_INCLUDE_IMAGES   (default: 0)
    PG_DUMP_PATH            (default: pg_dump - full path if not in PATH)
"""

import hashlib
import logging
import os
import shutil
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

from app.distributed import coordinator
from app.env import load_app_env

load_app_env()

BACKEND_DIR             = Path(__file__).resolve().parents[1]
BACKUP_DIR             = os.getenv("BACKUP_DIR", "./backups")
BACKUP_INTERVAL_HOURS  = int(os.getenv("BACKUP_INTERVAL_HOURS", "24"))
BACKUP_KEEP_COUNT      = int(os.getenv("BACKUP_KEEP_COUNT", "14"))
BACKUP_INCLUDE_IMAGES  = os.getenv("BACKUP_INCLUDE_IMAGES", "0") == "1"
PG_DUMP_PATH           = os.getenv("PG_DUMP_PATH", "pg_dump")
IMAGES_DIR             = os.getenv("IMAGES_DIR", str(BACKEND_DIR / "media"))
DATABASE_URL           = os.getenv("DATABASE_URL", "")
BACKUP_MIN_BYTES       = int(os.getenv("BACKUP_MIN_BYTES", "1024"))


def _parse_db_url(url: str):
    """Parse postgresql+psycopg2://user:pass@host:port/dbname"""
    # Strip the +driver suffix for urlparse
    clean = url.replace("postgresql+psycopg2://", "postgresql://")
    parsed = urlparse(clean)
    return {
        "user": parsed.username or "postgres",
        "password": parsed.password or "",
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "dbname": parsed.path.lstrip("/") or "face_analytics",
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_backup_manifest(path: str | Path) -> Path:
    backup_path = Path(path)
    manifest = backup_path.with_suffix(backup_path.suffix + ".sha256")
    manifest.write_text(f"{_sha256(backup_path)}  {backup_path.name}\n", encoding="ascii")
    return manifest


def verify_backup(path: str | Path, require_manifest: bool = False) -> bool:
    backup_path = Path(path)
    if not backup_path.is_file() or backup_path.stat().st_size < BACKUP_MIN_BYTES:
        return False
    manifest = backup_path.with_suffix(backup_path.suffix + ".sha256")
    if not manifest.exists():
        return not require_manifest
    expected = manifest.read_text(encoding="ascii").split()[0].strip().lower()
    return bool(expected) and expected == _sha256(backup_path)


def backup_database():
    """Run pg_dump and write to BACKUP_DIR."""
    if not DATABASE_URL:
        logger.warning("DATABASE_URL not set, skipping DB backup.")
        return None

    Path(BACKUP_DIR).mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_file = Path(BACKUP_DIR) / f"db_{timestamp}.sql"

    cfg = _parse_db_url(DATABASE_URL)
    env = os.environ.copy()
    env["PGPASSWORD"] = cfg["password"]

    cmd = [
        PG_DUMP_PATH,
        "-h", cfg["host"],
        "-p", cfg["port"],
        "-U", cfg["user"],
        "-d", cfg["dbname"],
        "--no-owner",
        "--no-acl",
        "-f", str(out_file),
    ]

    try:
        result = subprocess.run(
            cmd, env=env, capture_output=True, text=True, timeout=600
        )
        if result.returncode != 0:
            logger.error("pg_dump failed: %s", result.stderr)
            out_file.unlink(missing_ok=True)
            return None

        if out_file.stat().st_size < BACKUP_MIN_BYTES:
            logger.error("pg_dump produced an unexpectedly small file: %s", out_file)
            out_file.unlink(missing_ok=True)
            return None

        write_backup_manifest(out_file)
        size_mb = out_file.stat().st_size / 1024 / 1024
        logger.info("DB backup: %s (%.1f MB)", out_file.name, size_mb)
        return str(out_file)

    except FileNotFoundError:
        logger.error("pg_dump not found. Install PostgreSQL client or set PG_DUMP_PATH.")
        return None
    except Exception as e:
        logger.error("DB backup error: %s", e)
        return None


def backup_images():
    """Zip media directory into backup."""
    if not BACKUP_INCLUDE_IMAGES:
        return None

    images_path = Path(IMAGES_DIR)
    if not images_path.exists():
        logger.warning("Images dir not found: %s", IMAGES_DIR)
        return None

    Path(BACKUP_DIR).mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_zip = Path(BACKUP_DIR) / f"images_{timestamp}"

    try:
        archive = shutil.make_archive(
            str(out_zip), "zip", root_dir=str(images_path)
        )
        size_mb = Path(archive).stat().st_size / 1024 / 1024
        logger.info("Images backup: %s (%.1f MB)", Path(archive).name, size_mb)
        return archive
    except Exception as e:
        logger.error("Images backup error: %s", e)
        return None


def prune_old_backups():
    """Keep only BACKUP_KEEP_COUNT newest backups of each type."""
    bd = Path(BACKUP_DIR)
    if not bd.exists():
        return

    for pattern in ("db_*.sql", "images_*.zip"):
        files = sorted(bd.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
        for f in files[BACKUP_KEEP_COUNT:]:
            try:
                f.unlink()
                f.with_suffix(f.suffix + ".sha256").unlink(missing_ok=True)
                logger.info("Pruned: %s", f.name)
            except Exception:
                pass


def run_full_backup():
    """Run DB + images backup, then prune."""
    logger.info("Starting full backup at %s", datetime.utcnow().isoformat())
    backup_database()
    backup_images()
    prune_old_backups()
    logger.info("Backup complete.")


# ============================================================
# SCHEDULER
# ============================================================

_scheduler_started = False


def _backup_loop():
    # Wait a bit before first run (let server start cleanly)
    time.sleep(60)
    while True:
        try:
            with coordinator.lock(
                "backup",
                ttl_seconds=max(3600, BACKUP_INTERVAL_HOURS * 3600),
            ) as acquired:
                if acquired:
                    run_full_backup()
        except Exception as e:
            logger.error("Backup loop error: %s", e)
        time.sleep(BACKUP_INTERVAL_HOURS * 3600)


def start_backup_scheduler():
    global _scheduler_started
    if _scheduler_started:
        return
    thread = threading.Thread(target=_backup_loop, daemon=True, name="backup-scheduler")
    thread.start()
    _scheduler_started = True
    logger.info(
        "Backup scheduler started. Interval: %dh, Keep: %d, Images: %s",
        BACKUP_INTERVAL_HOURS, BACKUP_KEEP_COUNT, BACKUP_INCLUDE_IMAGES,
    )


if __name__ == "__main__":
    run_full_backup()
