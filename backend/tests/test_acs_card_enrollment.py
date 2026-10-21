import time

from app.routers import acs_person_management


def test_card_event_key_prefers_device_serial_number():
    first = {"serial_no": 42, "card_number": "111"}
    second = {"serial_no": 42, "card_number": "222"}

    assert acs_person_management._card_event_key(first) == (
        "serial",
        "42",
    )
    assert acs_person_management._card_event_key(first) == (
        acs_person_management._card_event_key(second)
    )


def test_card_event_key_falls_back_to_event_fields():
    first = {
        "time": "2026-06-09T17:00:00+04:00",
        "card_number": "111",
        "employee_no": "10",
        "door_no": 1,
        "minor_type": 1,
    }
    second = {**first, "card_number": "222"}

    assert acs_person_management._card_event_key(first) != (
        acs_person_management._card_event_key(second)
    )


def test_expired_card_enrollment_sessions_are_purged():
    acs_person_management._card_enrollments.clear()
    acs_person_management._card_enrollments.update({
        "expired": {"expires_at": time.monotonic() - 1},
        "active": {"expires_at": time.monotonic() + 60},
    })

    acs_person_management._purge_card_enrollments()

    assert "expired" not in acs_person_management._card_enrollments
    assert "active" in acs_person_management._card_enrollments
    acs_person_management._card_enrollments.clear()
