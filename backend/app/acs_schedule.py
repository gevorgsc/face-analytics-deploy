"""Validation and presentation helpers for access-level schedules."""

from copy import deepcopy
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException


DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
DAY_LABELS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
DEVICE_DAY_LABELS = (
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
)
DEFAULT_TIMEZONE = "Asia/Yerevan"


def default_schedule_config() -> dict:
    return {
        "name": "All Day",
        "timezone": DEFAULT_TIMEZONE,
        "weekly": {
            day: [{"start": "00:00", "end": "23:59"}]
            for day in DAY_KEYS
        },
        "holiday_mode": "follow_weekly",
        "controller_plan_template_no": 1,
    }


def _minutes(value: str) -> int:
    try:
        hour_text, minute_text = value.split(":", 1)
        hour, minute = int(hour_text), int(minute_text)
    except (AttributeError, TypeError, ValueError):
        raise HTTPException(400, f'Invalid schedule time "{value}"')
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise HTTPException(400, f'Invalid schedule time "{value}"')
    return hour * 60 + minute


def validate_schedule_config(value) -> dict:
    if value in (None, "", {}):
        return default_schedule_config()
    if not isinstance(value, dict):
        raise HTTPException(400, "schedule_config must be an object")

    timezone_name = str(value.get("timezone") or DEFAULT_TIMEZONE).strip()
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        raise HTTPException(400, f'Unknown timezone "{timezone_name}"')

    weekly = value.get("weekly")
    if not isinstance(weekly, dict):
        raise HTTPException(400, "schedule_config.weekly must be an object")

    normalized_weekly = {}
    for day in DAY_KEYS:
        periods = weekly.get(day) or []
        if not isinstance(periods, list) or len(periods) > 4:
            raise HTTPException(400, f"{day} must contain at most 4 time periods")
        normalized_periods = []
        previous_end = -1
        for period in periods:
            if not isinstance(period, dict):
                raise HTTPException(400, f"{day} schedule periods must be objects")
            start = str(period.get("start") or "")
            end = str(period.get("end") or "")
            start_minutes = _minutes(start)
            end_minutes = _minutes(end)
            if end_minutes <= start_minutes:
                raise HTTPException(400, f"{day} period end must be after start")
            if start_minutes < previous_end:
                raise HTTPException(400, f"{day} schedule periods overlap")
            previous_end = end_minutes
            normalized_periods.append({"start": start, "end": end})
        normalized_weekly[day] = normalized_periods

    holiday_mode = value.get("holiday_mode") or "follow_weekly"
    if holiday_mode not in {"follow_weekly", "deny", "allow"}:
        raise HTTPException(400, "holiday_mode must be follow_weekly, deny, or allow")

    plan_number = value.get("controller_plan_template_no")
    if plan_number in ("", None):
        plan_number = None
    else:
        try:
            plan_number = int(plan_number)
        except (TypeError, ValueError):
            raise HTTPException(400, "controller_plan_template_no must be a number")
        if not 1 <= plan_number <= 255:
            raise HTTPException(400, "controller_plan_template_no must be between 1 and 255")

    return {
        "name": str(value.get("name") or "Custom Schedule").strip()[:100],
        "timezone": timezone_name,
        "weekly": normalized_weekly,
        "holiday_mode": holiday_mode,
        "controller_plan_template_no": plan_number,
    }


def schedule_summary(config: dict) -> str:
    schedule = validate_schedule_config(deepcopy(config))
    weekly = schedule["weekly"]
    all_day = all(
        periods == [{"start": "00:00", "end": "23:59"}]
        for periods in weekly.values()
    )
    if all_day:
        return "All Day"

    weekdays = [weekly[day] for day in DAY_KEYS[:5]]
    weekend_closed = not weekly["sat"] and not weekly["sun"]
    if weekend_closed and all(periods == weekdays[0] for periods in weekdays):
        period = weekdays[0]
        if len(period) == 1:
            return f"Weekdays {period[0]['start']}-{period[0]['end']}"

    active_days = [DAY_LABELS[index] for index, day in enumerate(DAY_KEYS) if weekly[day]]
    return f"{len(active_days)} days configured" if active_days else "No Access"


def schedule_is_active(config: dict, at: datetime | None = None) -> bool:
    schedule = validate_schedule_config(deepcopy(config))
    timezone = ZoneInfo(schedule["timezone"])
    moment = at or datetime.now(timezone)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone)
    else:
        moment = moment.astimezone(timezone)
    periods = schedule["weekly"][DAY_KEYS[moment.weekday()]]
    current_minutes = moment.hour * 60 + moment.minute
    return any(
        _minutes(period["start"]) <= current_minutes < (
            24 * 60 if period["end"] == "23:59" else _minutes(period["end"])
        )
        for period in periods
    )


def build_user_right_week_plan_payload(config: dict) -> dict:
    """Convert a platform weekly schedule to Hikvision's 56-slot plan."""
    schedule = validate_schedule_config(deepcopy(config))
    entries = []
    for index, day in enumerate(DAY_KEYS):
        periods = schedule["weekly"][day]
        for slot in range(8):
            period = periods[slot] if slot < len(periods) else None
            begin = f"{period['start']}:00" if period else "00:00:00"
            if period and period["end"] == "23:59":
                end = "24:00:00"
            else:
                end = f"{period['end']}:00" if period else "00:00:00"
            entries.append({
                "week": DEVICE_DAY_LABELS[index],
                "id": slot + 1,
                "enable": bool(period),
                "TimeSegment": {
                    "beginTime": begin,
                    "endTime": end,
                },
                "authenticationTimesEnabled": False,
                "authenticationTimes": 0,
            })
    return {
        "UserRightWeekPlanCfg": {
            "enable": True,
            "WeekPlanCfg": entries,
        }
    }


def user_right_week_plan_matches(expected_payload: dict, actual_payload: dict) -> bool:
    expected = expected_payload.get("UserRightWeekPlanCfg", {}).get("WeekPlanCfg", [])
    actual = actual_payload.get("UserRightWeekPlanCfg", {}).get("WeekPlanCfg", [])

    def normalized(entries):
        return [
            (
                item.get("week"),
                int(item.get("id") or 0),
                bool(item.get("enable")),
                item.get("TimeSegment", {}).get("beginTime"),
                item.get("TimeSegment", {}).get("endTime"),
            )
            for item in entries
        ]

    return normalized(expected) == normalized(actual)


def build_user_right_holiday_plan_payload(
    holiday_date: str,
    policy: str,
) -> dict:
    if policy not in {"allow", "deny"}:
        raise HTTPException(400, "Holiday policy must be allow or deny")
    allow = policy == "allow"
    entries = []
    for slot in range(8):
        enabled = allow and slot == 0
        entries.append({
            "id": slot + 1,
            "enable": enabled,
            "TimeSegment": {
                "beginTime": "00:00:00",
                "endTime": "24:00:00" if enabled else "00:00:00",
            },
            "authenticationTimesEnabled": False,
            "authenticationTimes": 0,
        })
    return {
        "UserRightHolidayPlanCfg": {
            "enable": True,
            "beginDate": holiday_date,
            "endDate": holiday_date,
            "HolidayPlanCfg": entries,
        }
    }


def user_right_holiday_plan_matches(expected_payload: dict, actual_payload: dict) -> bool:
    expected = expected_payload.get("UserRightHolidayPlanCfg", {})
    actual = actual_payload.get("UserRightHolidayPlanCfg", {})
    if (
        expected.get("beginDate") != actual.get("beginDate")
        or expected.get("endDate") != actual.get("endDate")
    ):
        return False

    def normalized(entries):
        return [
            (
                int(item.get("id") or 0),
                bool(item.get("enable")),
                item.get("TimeSegment", {}).get("beginTime"),
                item.get("TimeSegment", {}).get("endTime"),
            )
            for item in entries
        ]

    return normalized(expected.get("HolidayPlanCfg", [])) == normalized(
        actual.get("HolidayPlanCfg", [])
    )
