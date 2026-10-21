import json


USER_PERMISSION_GROUPS = {
    "view_dashboard": "viewer",
    "view_events": "viewer",
    "view_persons": "viewer",
    "view_attendance": "viewer",
    "view_cameras": "viewer",
    "view_live": "viewer",
    "manage_persons": "operator",
    "manage_events": "operator",
    "manage_cameras": "admin",
    "manage_users": "admin",
    "manage_alerts": "admin",
    "manage_settings": "admin",
    "export_reports": "admin",
}


DEFAULT_USER_PERMISSIONS = [
    "view_dashboard",
    "view_events",
    "view_persons",
    "view_attendance",
]


def default_permissions_for_role(role: str | None) -> list[str]:
    if role == "admin":
        return list(USER_PERMISSION_GROUPS.keys())
    if role == "operator":
        return [
            *DEFAULT_USER_PERMISSIONS,
            "view_cameras",
            "view_live",
            "manage_persons",
            "manage_events",
        ]
    return list(DEFAULT_USER_PERMISSIONS)


def normalize_permissions(value) -> list[str]:
    if value is None:
        return list(DEFAULT_USER_PERMISSIONS)

    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = []

    if not isinstance(value, list):
        value = []

    allowed = set(USER_PERMISSION_GROUPS)
    normalized = []
    for item in value:
        if item in allowed and item not in normalized:
            normalized.append(item)

    return normalized or list(DEFAULT_USER_PERMISSIONS)


def user_permissions(value, role: str | None = None) -> list[str]:
    if value in (None, "", "[]", []):
        return default_permissions_for_role(role)
    return normalize_permissions(value)


def permissions_to_role(permissions: list[str]) -> str:
    normalized = normalize_permissions(permissions)
    levels = {USER_PERMISSION_GROUPS[p] for p in normalized}
    if "admin" in levels:
        return "admin"
    if "operator" in levels:
        return "operator"
    return "viewer"


def permissions_json(value) -> str:
    return json.dumps(normalize_permissions(value))
