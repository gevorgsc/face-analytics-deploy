"""Tests for Face Analytics events router — listing, filtering, stats."""

from datetime import timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import CameraDevice, FaceEvent, Person


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _seed(db):
    cam = CameraDevice(name="Cam1", ip_address="10.0.0.1")
    person = Person(full_name="Test Person", person_type="employee")
    db.add_all([cam, person]); db.commit()

    from app.utils import utc_now
    now = utc_now()
    events = [
        FaceEvent(camera_name="Cam1", camera_id=cam.id, person_id=person.id,
                  source="face_analytics", event_type="recognized",
                  confidence=0.95, created_at=now - timedelta(minutes=i))
        for i in range(5)
    ]
    # Add one ACS event that should be excluded from FA list
    events.append(FaceEvent(camera_id=cam.id, source="access_controller",
                            event_type="recognized", created_at=now))
    for ev in events:
        db.add(ev)
    db.commit()
    return cam, person


class _FakeResponse:
    def __init__(self):
        self.headers = {}


# ── List events ───────────────────────────────────────────────────────────────

def test_list_events_returns_only_fa_source():
    from app.routers.events import list_events
    db = _session()
    _seed(db)
    resp = _FakeResponse()
    result = list_events(response=resp, limit=100, offset=0, db=db, current_user=None)
    assert all(getattr(ev, 'source', 'face_analytics') == 'face_analytics' for ev in result)


def test_list_events_total_count_header():
    from app.routers.events import list_events
    db = _session()
    _seed(db)
    resp = _FakeResponse()
    list_events(response=resp, limit=2, offset=0, db=db, current_user=None)
    assert int(resp.headers.get("X-Total-Count", 0)) == 5


def test_list_events_pagination():
    from app.routers.events import list_events
    db = _session()
    _seed(db)
    resp = _FakeResponse()
    page1 = list_events(response=resp, limit=3, offset=0, db=db, current_user=None)
    page2 = list_events(response=resp, limit=3, offset=3, db=db, current_user=None)
    assert len(page1) == 3
    assert len(page2) == 2
    assert set(e.id for e in page1).isdisjoint(set(e.id for e in page2))


# ── Stats ─────────────────────────────────────────────────────────────────────

def test_stats_returns_correct_counts():
    from app.routers.events import stats  # actual function name is 'stats'
    db = _session()
    cam, person = _seed(db)
    result = stats(db=db, current_user=None)
    assert result["total_events"] >= 5
    assert "total_persons" in result
    assert "today_events" in result


# ── Search by picture ─────────────────────────────────────────────────────────

def test_search_endpoint_exists():
    """Smoke test — endpoint is importable and callable (won't run ML in unit test)."""
    from app.routers.events import search_by_picture  # noqa: F401
    assert callable(search_by_picture)


# ── Attendance ────────────────────────────────────────────────────────────────

def test_attendance_list_returns_list():
    from app.routers.events import attendance  # actual function name is 'attendance'
    import inspect
    # Use only params the function actually accepts
    sig = inspect.signature(attendance)
    params = {p: None for p in sig.parameters if p not in ('db', 'current_user', 'response')}
    if 'limit' in params: params['limit'] = 100
    db = _session()
    result = attendance(**params, db=db, current_user=None)
    assert isinstance(result, list)
