"""Tests for ACS Analytics — summary, hourly, by-door, top-persons, denials, export."""

from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import AccessControlDevice, AcsAccessEvent, AcsDenialLog, Person
from app.routers.acs_analytics import (
    analytics_summary, hourly_heatmap, by_door_stats,
    top_persons, daily_trend, denial_breakdown, export_access_events,
)
from app.utils import utc_now
from fastapi.responses import StreamingResponse


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _seed(db):
    person = Person(full_name="Bob", person_type="employee")
    device = AccessControlDevice(name="Door 1", ip_address="10.0.0.2")
    db.add_all([person, device]); db.commit()

    now = utc_now()
    for i in range(3):
        db.add(AcsAccessEvent(
            device_id=device.id, person_id=person.id,
            event_type="access_granted", door_no=1,
            created_at=now - timedelta(hours=i),
        ))
    db.add(AcsAccessEvent(
        device_id=device.id, person_id=person.id,
        event_type="access_denied", door_no=1,
        created_at=now - timedelta(minutes=30),
    ))
    db.commit()
    return person, device


def test_summary_returns_correct_counts():
    db = _session()
    _seed(db)
    result = analytics_summary(hours=24, db=db, current_user=None)
    assert result["total_events"] == 4
    assert result["granted"] == 3
    assert result["denied"] == 1
    assert result["unique_persons"] == 1
    assert result["denial_rate_pct"] == 25.0


def test_summary_empty_db():
    db = _session()
    result = analytics_summary(hours=24, db=db, current_user=None)
    assert result["total_events"] == 0
    assert result["denial_rate_pct"] == 0.0


def test_hourly_heatmap_returns_24_hours():
    db = _session()
    _seed(db)
    # Pass device_id=None explicitly to avoid FastAPI Query(None) default being passed as-is
    result = hourly_heatmap(days=1, device_id=None, db=db, current_user=None)
    assert len(result["hourly"]) == 24
    assert all("hour" in h and "count" in h for h in result["hourly"])


def test_by_door_returns_device_name():
    db = _session()
    _, device = _seed(db)
    result = by_door_stats(hours=24, db=db, current_user=None)
    assert len(result["doors"]) >= 1
    assert result["doors"][0]["device_name"] == device.name


def test_top_persons_includes_person_name():
    db = _session()
    person, _ = _seed(db)
    result = top_persons(hours=24, limit=10, db=db, current_user=None)
    assert len(result["persons"]) >= 1
    assert result["persons"][0]["person_name"] == person.full_name
    assert result["persons"][0]["access_count"] >= 1


def test_daily_trend_returns_sorted_dates():
    db = _session()
    _seed(db)
    result = daily_trend(days=7, device_id=None, db=db, current_user=None)
    dates = [r["date"] for r in result["trend"]]
    assert dates == sorted(dates)


def test_export_csv_returns_streaming_response():
    db = _session()
    _seed(db)
    resp = export_access_events(hours=24, format="csv", device_id=None, event_type=None, db=db, current_user=None)
    assert isinstance(resp, StreamingResponse)
    assert "csv" in resp.media_type


def test_export_excel_returns_streaming_response():
    db = _session()
    _seed(db)
    resp = export_access_events(hours=24, format="excel", device_id=None, event_type=None, db=db, current_user=None)
    assert isinstance(resp, StreamingResponse)
