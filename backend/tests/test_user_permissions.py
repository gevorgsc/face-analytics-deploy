from app.user_permissions import normalize_permissions, permissions_to_role, user_permissions


def test_permissions_to_role_uses_viewer_for_read_only():
    assert permissions_to_role(["view_dashboard", "view_events"]) == "viewer"


def test_permissions_to_role_uses_operator_for_operational_actions():
    assert permissions_to_role(["view_events", "manage_persons"]) == "operator"


def test_permissions_to_role_uses_admin_for_admin_actions():
    assert permissions_to_role(["view_events", "manage_users"]) == "admin"


def test_normalize_permissions_filters_unknown_values():
    assert normalize_permissions(["view_events", "bad", "view_events"]) == ["view_events"]


def test_existing_admin_without_saved_permissions_gets_all_permissions():
    permissions = user_permissions("[]", "admin")

    assert "manage_users" in permissions
    assert "manage_settings" in permissions
