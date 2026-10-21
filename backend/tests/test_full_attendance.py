from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import (
    AttendanceRecord,
    AttendanceRequest,
    AttendanceSchedule,
    AttendanceShift,
    Person,
    User,
)
from app.routers.attendance_pro import (
    _CreateShiftBody,
    _ReviewRequestBody,
    _effective_attendance_rule,
    create_shift,
    review_request,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _admin(db):
    user = User(username="admin", password_hash="x", role="admin")
    db.add(user)
    db.commit()
    return user


def test_create_shift_normalizes_work_days():
    db = _session()
    shift = create_shift(
        _CreateShiftBody(
            name="Office",
            work_start="09:00",
            work_end="18:00",
            work_days=[5, 1, 1, 3],
        ),
        db,
        _admin(db),
    )
    assert shift["work_days"] == [1, 3, 5]


def test_approved_leave_creates_daily_records():
    db = _session()
    admin = _admin(db)
    person = Person(full_name="Employee", person_type="employee", source="acs", acs_active=1)
    db.add(person)
    db.flush()
    request = AttendanceRequest(
        person_id=person.id,
        request_type="leave",
        date_from="2026-06-10",
        date_to="2026-06-11",
        status="pending",
    )
    db.add(request)
    db.commit()

    result = review_request(request.id, _ReviewRequestBody(decision="approved"), db, admin)
    records = db.query(AttendanceRecord).order_by(AttendanceRecord.work_date).all()

    assert result["status"] == "approved"
    assert [(record.work_date, record.status) for record in records] == [
        ("2026-06-10", "leave"),
        ("2026-06-11", "leave"),
    ]


def test_approved_correction_sets_check_in_out_and_work_minutes():
    db = _session()
    admin = _admin(db)
    person = Person(full_name="Employee", person_type="employee", source="acs", acs_active=1)
    db.add(person)
    db.flush()
    request = AttendanceRequest(
        person_id=person.id,
        request_type="correction",
        date_from="2026-06-10",
        date_to="2026-06-10",
        correction_in="09:00",
        correction_out="18:00",
        status="pending",
    )
    db.add(request)
    db.commit()

    review_request(request.id, _ReviewRequestBody(decision="approved"), db, admin)
    record = db.query(AttendanceRecord).one()

    assert record.status == "present"
    assert record.work_minutes == 540
    assert record.is_manual == 1


def test_effective_schedule_shift_overrides_global_rule():
    db = _session()
    person = Person(full_name="Employee", person_type="employee", source="acs", acs_active=1)
    shift = AttendanceShift(
        name="Evening",
        work_start="14:00",
        work_end="22:00",
        work_days="1,2,3,4,5",
        is_active=1,
    )
    db.add_all([person, shift])
    db.flush()
    db.add(AttendanceSchedule(
        person_id=person.id,
        shift_id=shift.id,
        valid_from="2026-06-01",
        valid_to=None,
        is_active=1,
    ))
    db.commit()

    rule = _effective_attendance_rule(db, person.id, "2026-06-10")
    assert rule.name == "Evening"
