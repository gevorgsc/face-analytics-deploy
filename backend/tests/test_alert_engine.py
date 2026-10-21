from app.alert_engine import build_alert_message


def test_alert_message_contains_core_event_info():
    message = build_alert_message({
        "event_id": 12,
        "person_name": "Test Person",
        "person_type": "blacklist",
        "camera_name": "Main Office",
        "confidence": 0.91,
        "created_at": "2026-06-02 10:00:00",
    })

    assert "Test Person" in message
    assert "Main Office" in message
    assert "91.0%" in message
    assert "Event ID: 12" in message
