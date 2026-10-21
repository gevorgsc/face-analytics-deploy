
from starlette.requests import Request

from app import backup
from app.distributed import DistributedCoordinator
from app.operations import media_storage_status
from app.routers.admin import _metrics_access_allowed


def test_media_storage_reports_directory_size(tmp_path, monkeypatch):
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    (media_dir / "snapshot.jpg").write_bytes(b"x" * 128)
    monkeypatch.setenv("MEDIA_MIN_FREE_GB", "0")
    monkeypatch.setenv("MEDIA_MAX_GB", "0")

    status = media_storage_status(media_dir)

    assert status["ok"] is True
    assert status["media_bytes"] == 128
    assert status["reasons"] == []


def test_media_storage_detects_quota_pressure(tmp_path, monkeypatch):
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    (media_dir / "snapshot.jpg").write_bytes(b"x" * 128)
    monkeypatch.setenv("MEDIA_MIN_FREE_GB", "0")
    monkeypatch.setenv("MEDIA_MAX_GB", "0.00000001")

    status = media_storage_status(media_dir)

    assert status["ok"] is False
    assert "media_quota_exceeded" in status["reasons"]


def test_backup_manifest_detects_corruption(tmp_path, monkeypatch):
    monkeypatch.setattr(backup, "BACKUP_MIN_BYTES", 1)
    backup_file = tmp_path / "db.sql"
    backup_file.write_bytes(b"valid backup")
    backup.write_backup_manifest(backup_file)

    assert backup.verify_backup(backup_file, require_manifest=True) is True

    backup_file.write_bytes(b"changed backup")
    assert backup.verify_backup(backup_file, require_manifest=True) is False


def test_local_coordinator_lock_is_exclusive(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    coordinator = DistributedCoordinator(redis_url="")

    with coordinator.lock("test", ttl_seconds=10) as first:
        with coordinator.lock("test", ttl_seconds=10) as second:
            assert first is True
            assert second is False


def test_metrics_access_allows_loopback(monkeypatch):
    monkeypatch.delenv("METRICS_API_KEY", raising=False)
    monkeypatch.setenv("METRICS_ALLOW_PRIVATE", "0")
    request = Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": []})

    assert _metrics_access_allowed(request) is True


def test_metrics_access_requires_policy_for_remote_client(monkeypatch):
    monkeypatch.delenv("METRICS_API_KEY", raising=False)
    monkeypatch.setenv("METRICS_ALLOW_PRIVATE", "0")
    request = Request({"type": "http", "client": ("203.0.113.20", 1234), "headers": []})

    assert _metrics_access_allowed(request) is False
