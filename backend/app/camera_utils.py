import ipaddress
from typing import Callable

from fastapi import HTTPException

from app.models import CameraDevice


def validate_camera_ip(ip_address: str) -> str:
    ip_address = (ip_address or "").strip()
    try:
        addr = ipaddress.ip_address(ip_address)
    except ValueError:
        raise HTTPException(400, "Camera IP address is invalid")
    if addr.is_loopback:
        raise HTTPException(400, "Camera IP address cannot be a loopback address")
    if addr.is_link_local:
        raise HTTPException(400, "Camera IP address cannot be a link-local address")
    if addr.is_unspecified:
        raise HTTPException(400, "Camera IP address cannot be the unspecified address")
    return ip_address


def validate_port(value, default: int = 554) -> int:
    raw_value = default if value is None or value == "" else value
    try:
        port = int(raw_value)
    except (TypeError, ValueError):
        raise HTTPException(400, "Camera port must be a number")

    if port < 1 or port > 65535:
        raise HTTPException(400, "Camera port must be between 1 and 65535")
    return port


def validate_direction(value, default: str = "both") -> str:
    direction = (value or default or "both").strip().lower()
    if direction not in {"in", "out", "both"}:
        raise HTTPException(400, "Camera direction must be one of: in, out, both")
    return direction

def camera_to_dict(camera: CameraDevice, signer: Callable[[dict], dict] | None = None) -> dict:
    payload = {
        "id": camera.id,
        "name": camera.name,
        "ip_address": camera.ip_address,
        "port": camera.port,
        "username": camera.username,
        "has_password": bool(camera.password),
        "location": camera.location,
        "is_active": camera.is_active,
        "ai_enabled": camera.ai_enabled,
        "live_enabled": camera.live_enabled,
        "direction": camera.direction or "both",
        "snapshot_mode": camera.snapshot_mode or "hiksdk",
        "http_port": camera.http_port or 80,
        "notes": camera.notes,
        "created_at": camera.created_at,
        "updated_at": camera.updated_at,
    }
    return signer(payload) if signer else payload
