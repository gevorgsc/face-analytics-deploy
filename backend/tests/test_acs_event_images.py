import os
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import Response

from app.db import Base
from app.models import AccessControlDevice, AcsAccessEvent, FaceEvent, Person
from app.routers.access_control import _serialize_events_with_images
from app.routers.events import list_events
from app.routers.persons import person_history
from app.utils import MEDIA_DIR


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_unknown_face_event_uses_matching_controller_snapshot():
    db = _session()
    now = datetime(2026, 6, 9, 17, 0, 0)
    device = AccessControlDevice(name="Terminal", ip_address="127.0.0.1")
    unknown = Person(person_type="unknown", source="fa")
    db.add_all([device, unknown])
    db.flush()
    db.add(FaceEvent(
        person_id=unknown.id,
        camera_name="Terminal",
        source="access_controller",
        crop_image_path="/media/controller.jpg",
        raw_payload="ACS serial=77",
        created_at=now + timedelta(seconds=1),
    ))
    event = AcsAccessEvent(
        device_id=device.id,
        door_no=1,
        event_type="access_event",
        verify_mode="cardOrfaceOrPw",
        source_serial_no=77,
        created_at=now,
    )
    db.add(event)
    db.commit()

    row = _serialize_events_with_images(db, [event])[0]

    assert "/media/controller.jpg" in row["event_image"]
    assert row["image_source"] == "face_event"


def test_card_event_uses_person_profile_not_nearby_face():
    db = _session()
    now = datetime(2026, 6, 9, 17, 0, 0)
    profile_path = os.path.join(MEDIA_DIR, "profile.jpg")
    os.makedirs(MEDIA_DIR, exist_ok=True)
    with open(profile_path, "wb") as profile:
        profile.write(b"test-profile")
    device = AccessControlDevice(name="Terminal", ip_address="127.0.0.1")
    person = Person(
        full_name="Card User",
        person_type="employee",
        preview_image="/media/profile.jpg",
    )
    db.add_all([device, person])
    db.flush()
    db.add(FaceEvent(
        person_id=person.id,
        camera_name="Entrance",
        crop_image_path="/media/nearby.jpg",
        created_at=now,
    ))
    event = AcsAccessEvent(
        device_id=device.id,
        door_no=1,
        person_id=person.id,
        card_number="123",
        event_type="access_granted",
        verify_mode="cardOrfaceOrPw",
        created_at=now,
    )
    db.add(event)
    db.commit()

    try:
        row = _serialize_events_with_images(db, [event])[0]

        assert "/media/profile.jpg" in row["event_image"]
        assert row["image_source"] == "profile"
    finally:
        os.remove(profile_path)


def test_registered_face_event_prefers_profile_over_controller_snapshot():
    db = _session()
    now = datetime(2026, 6, 9, 17, 0, 0)
    profile_path = os.path.join(MEDIA_DIR, "registered-profile.jpg")
    os.makedirs(MEDIA_DIR, exist_ok=True)
    with open(profile_path, "wb") as profile:
        profile.write(b"test-profile")

    device = AccessControlDevice(name="Terminal", ip_address="127.0.0.1")
    person = Person(
        full_name="Registered User",
        person_type="employee",
        preview_image="/media/registered-profile.jpg",
    )
    db.add_all([device, person])
    db.flush()
    event = AcsAccessEvent(
        device_id=device.id,
        door_no=1,
        person_id=person.id,
        event_type="access_granted",
        verify_mode="face",
        source_serial_no=88,
        created_at=now,
    )
    db.add(event)
    db.add(FaceEvent(
        person_id=person.id,
        camera_name="Terminal",
        source="access_controller",
        crop_image_path="/media/live-snapshot.jpg",
        raw_payload="ACS serial=88",
        created_at=now,
    ))
    db.commit()

    try:
        row = _serialize_events_with_images(db, [event])[0]
        assert "/media/registered-profile.jpg" in row["event_image"]
        assert row["image_source"] == "profile"
    finally:
        os.remove(profile_path)


def test_face_analytics_event_list_excludes_access_controller_snapshots():
    db = _session()
    person = Person(full_name="Employee", person_type="employee", source="fa")
    db.add(person)
    db.flush()
    db.add_all([
        FaceEvent(
            person_id=person.id,
            camera_name="Face Camera",
            source="face_analytics",
            crop_image_path="/media/face-camera.jpg",
        ),
        FaceEvent(
            person_id=person.id,
            camera_name="Access Terminal",
            source="access_controller",
            crop_image_path="/media/access-terminal.jpg",
            raw_payload="ACS serial=99",
        ),
    ])
    db.commit()

    response = Response()
    events = list_events(response=response, db=db, current_user=object())

    assert response.headers["X-Total-Count"] == "1"
    assert [event.camera_name for event in events] == ["Face Camera"]


def test_person_history_excludes_access_controller_snapshots_and_keeps_real_total():
    db = _session()
    person = Person(full_name="Employee", person_type="employee", source="fa")
    db.add(person)
    db.flush()
    db.add_all([
        FaceEvent(
            person_id=person.id,
            camera_name="Face Camera",
            source="face_analytics",
        ),
        FaceEvent(
            person_id=person.id,
            camera_name="Access Terminal",
            source="access_controller",
            raw_payload="ACS serial=100",
        ),
    ])
    db.commit()

    history = person_history(person.id, limit=300, db=db, current_user=object())

    assert history["stats"]["total_events"] == 1
    assert [event["camera_name"] for event in history["events"]] == ["Face Camera"]


def test_person_history_is_paginated_but_stats_cover_all_face_events():
    db = _session()
    person = Person(full_name="Frequent Visitor", person_type="employee", source="fa")
    db.add(person)
    db.flush()
    db.add_all([
        FaceEvent(
            person_id=person.id,
            camera_name="Lobby",
            source="face_analytics",
            is_low_quality=0,
        ),
        FaceEvent(
            person_id=person.id,
            camera_name="Lobby",
            source="face_analytics",
            is_low_quality=1,
        ),
        FaceEvent(
            person_id=person.id,
            camera_name="Office",
            source="face_analytics",
            is_low_quality=0,
        ),
    ])
    db.commit()

    history = person_history(person.id, limit=1, offset=1, db=db, current_user=object())

    assert len(history["events"]) == 1
    assert history["stats"]["total_events"] == 3
    assert history["stats"]["unique_cameras"] == 2
    assert history["stats"]["low_quality_events"] == 1
    assert history["pagination"] == {
        "limit": 1,
        "offset": 1,
        "returned": 1,
        "has_more": True,
    }
