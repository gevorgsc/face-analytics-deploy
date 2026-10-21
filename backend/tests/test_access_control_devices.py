import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import AccessControlDevice
from app.routers.access_control import _ensure_unique_device, _validated_device_values


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_device_values_reject_invalid_configuration():
    with pytest.raises(HTTPException, match="Device name is required"):
        _validated_device_values({"name": "", "ip_address": "192.168.1.10"})

    with pytest.raises(HTTPException, match="sdk_port must be between"):
        _validated_device_values({
            "name": "Front Door",
            "ip_address": "192.168.1.10",
            "sdk_port": 70000,
        })

    with pytest.raises(HTTPException, match="door_count must be between"):
        _validated_device_values({
            "name": "Front Door",
            "ip_address": "192.168.1.10",
            "door_count": 0,
        })


def test_duplicate_device_ip_is_rejected_but_current_device_is_allowed():
    db = _session()
    device = AccessControlDevice(name="Front Door", ip_address="192.168.1.10")
    db.add(device)
    db.commit()

    with pytest.raises(HTTPException) as error:
        _ensure_unique_device(db, "192.168.1.10")
    assert error.value.status_code == 409

    _ensure_unique_device(db, "192.168.1.10", exclude_device_id=device.id)
