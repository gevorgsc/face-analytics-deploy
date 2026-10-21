import pytest
from fastapi import HTTPException

from app.camera_pool import CameraWorker
from app.camera_utils import (
    camera_to_dict,
    validate_camera_ip,
    validate_direction,
    validate_port,
)
from app.models import CameraDevice


@pytest.mark.parametrize("value", ["172.16.11.197", "192.168.1.10"])
def test_validate_camera_ip_accepts_valid_ips(value):
    assert validate_camera_ip(value) == value


@pytest.mark.parametrize("value", ["", "abc", "999.1.1.1"])
def test_validate_camera_ip_rejects_invalid_ips(value):
    with pytest.raises(HTTPException):
        validate_camera_ip(value)


@pytest.mark.parametrize("value", [1, "554", 65535])
def test_validate_port_accepts_valid_values(value):
    assert validate_port(value) == int(value)


@pytest.mark.parametrize("value", [0, 65536, "abc"])
def test_validate_port_rejects_invalid_values(value):
    with pytest.raises(HTTPException):
        validate_port(value)


@pytest.mark.parametrize("value", ["in", "out", "both", " IN "])
def test_validate_direction_accepts_supported_values(value):
    assert validate_direction(value) in {"in", "out", "both"}


def test_validate_direction_rejects_unknown_values():
    with pytest.raises(HTTPException):
        validate_direction("side")


def test_camera_to_dict_omits_internal_camera_fields():
    camera = CameraDevice(
        id=7,
        name="Door",
        ip_address="172.16.11.197",
        port=8000,
        username="admin",
        password="secret",
        channel=101,
        direction="in",
        snapshot_mode="hiksdk",
    )

    data = camera_to_dict(camera)

    assert data["has_password"] is True
    assert data["snapshot_mode"] == "hiksdk"
    assert "channel" not in data


def test_camera_worker_status_has_runtime_diagnostics():
    status = CameraWorker(7, "rtsp://example.invalid/stream").status()

    assert status == {
        "connected": False,
        "failure_count": 0,
        "last_error": None,
        "last_connected_at": None,
        "last_frame_at": None,
        "frame_age_seconds": None,
        "next_retry_at": None,
    }
