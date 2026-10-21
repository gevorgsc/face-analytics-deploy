import re
from datetime import datetime, timezone
from pathlib import Path

from app.models import AttendanceRecord, AttendanceShift, Base
from app.routers.attendance_pro import _recalculate_record


def test_hikcentral_workflow_models_have_migration():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0018_hikcentral_workflows.py"
    )
    source = migration_path.read_text(encoding="utf-8")
    migrated_tables = set(re.findall(r'op\.create_table\(\s*"([^"]+)"', source))

    expected = {
        "visitor_watch_entries",
        "visitor_access_records",
        "attendance_breaks",
    }
    assert expected <= set(Base.metadata.tables)
    assert expected <= migrated_tables


def test_attendance_recalculation_deducts_break_and_tracks_overtime():
    shift = AttendanceShift(
        minimum_minutes=480,
        break_minutes=60,
        overtime_enabled=1,
        overtime_after_minutes=15,
    )
    record = AttendanceRecord(
        person_id=1,
        work_date="2026-06-11",
        check_in_at=datetime(2026, 6, 11, 5, 0, tzinfo=timezone.utc),
        check_out_at=datetime(2026, 6, 11, 15, 0, tzinfo=timezone.utc),
    )

    _recalculate_record(record, shift)

    assert record.break_minutes == 60
    assert record.work_minutes == 540
    assert record.overtime_minutes == 45
    assert record.calculation_version == 1
