from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import cleanup
from app.db import Base
from app.models import FaceEvent, Person


def _configure_cleanup(monkeypatch, tmp_path):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    monkeypatch.setattr(cleanup, "SessionLocal", session_factory)
    monkeypatch.setattr(cleanup, "IMAGES_DIR", str(tmp_path))
    monkeypatch.setattr(cleanup, "DRY_RUN", False)
    return session_factory


def test_orphan_cleanup_preserves_person_preview(monkeypatch, tmp_path):
    session_factory = _configure_cleanup(monkeypatch, tmp_path)
    preview = tmp_path / "profile.jpg"
    orphan = tmp_path / "orphan.jpg"
    preview.write_bytes(b"profile")
    orphan.write_bytes(b"orphan")

    db = session_factory()
    db.add(Person(
        full_name="Registered",
        person_type="employee",
        preview_image="/media/profile.jpg",
    ))
    db.commit()
    db.close()

    result = cleanup.cleanup_orphaned_images()

    assert preview.exists()
    assert not orphan.exists()
    assert result["orphans_deleted"] == 1


def test_old_event_cleanup_preserves_shared_person_preview(monkeypatch, tmp_path):
    session_factory = _configure_cleanup(monkeypatch, tmp_path)
    shared = tmp_path / "shared.jpg"
    shared.write_bytes(b"profile")

    db = session_factory()
    person = Person(
        full_name="Registered",
        person_type="employee",
        preview_image="/media/shared.jpg",
    )
    db.add(person)
    db.flush()
    db.add(FaceEvent(
        person_id=person.id,
        image_path="/media/shared.jpg",
        crop_image_path="/media/shared.jpg",
        created_at=datetime.now(timezone.utc) - timedelta(days=365),
        is_low_quality=0,
    ))
    db.commit()
    db.close()

    result = cleanup.cleanup_old_events()

    assert shared.exists()
    assert result["deleted_normal"] == 1
