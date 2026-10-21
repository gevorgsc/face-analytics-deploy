"""Operational health helpers shared by readiness and metrics."""

import os
import shutil
from pathlib import Path

from app.env import load_app_env

load_app_env()

_GB = 1024 ** 3


def _directory_size_bytes(path: Path) -> int:
    total = 0
    if not path.exists():
        return total
    for root, _, files in os.walk(path):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                continue
    return total


def media_storage_status(media_dir: str | Path) -> dict:
    path = Path(media_dir)
    usage_path = path if path.exists() else path.parent
    disk = shutil.disk_usage(usage_path)
    media_bytes = _directory_size_bytes(path)
    min_free_gb = float(os.getenv("MEDIA_MIN_FREE_GB", "2"))
    max_media_gb = float(os.getenv("MEDIA_MAX_GB", "0"))

    reasons = []
    if disk.free < min_free_gb * _GB:
        reasons.append("low_disk_space")
    if max_media_gb > 0 and media_bytes > max_media_gb * _GB:
        reasons.append("media_quota_exceeded")

    return {
        "ok": not reasons,
        "reasons": reasons,
        "media_bytes": media_bytes,
        "media_gb": round(media_bytes / _GB, 3),
        "disk_free_bytes": disk.free,
        "disk_free_gb": round(disk.free / _GB, 3),
        "min_free_gb": min_free_gb,
        "max_media_gb": max_media_gb,
    }
