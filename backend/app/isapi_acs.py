"""
isapi_acs.py — Hikvision ISAPI HTTP wrappers for ACS operations.

All functions are synchronous (run in thread pool from async endpoints).
Uses Basic Auth over HTTP (same pattern as acs_door_control_isapi_sync).

Covered:
  - card_push_isapi      — add/update a card on the device
  - card_delete_isapi    — revoke/delete a card from the device
  - card_list_isapi      — list all cards on the device (paginated)
  - door_config_get      — read door parameters
  - door_config_set      — update door parameters
  - face_sync_isapi      — push a face image to the device face library
  - acs_events_query     — query recent ACS events from device
  - device_info_isapi    — basic device info (model, firmware)
  - interlock_get        — get multi-door interlock config
  - interlock_set        — set multi-door interlock config
"""

import base64
import json
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional
from urllib.error import URLError
from urllib.request import Request as _Req, urlopen

import requests
from requests.auth import HTTPDigestAuth

logger = logging.getLogger(__name__)


# ── helpers ──────────────────────────────────────────────────────────────────

def _auth_header(username: str, password: str) -> str:
    return "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()


def _xml_req(url: str, method: str, body: str, username: str, password: str,
             timeout: int = 8) -> tuple[bool, str]:
    """Send an XML request, return (success, response_text)."""
    data = body.encode("utf-8") if body else None
    req = _Req(url, data=data, method=method, headers={
        "Content-Type": "application/xml",
        "Authorization": _auth_header(username, password),
    })
    try:
        with urlopen(req, timeout=timeout) as r:
            resp = r.read().decode("utf-8", errors="replace")
            return r.status < 400, resp
    except URLError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)


def _json_req(url: str, method: str, body: dict | None, username: str, password: str,
              timeout: int = 8) -> tuple[bool, dict]:
    data = json.dumps(body).encode("utf-8") if body else None
    req = _Req(url, data=data, method=method, headers={
        "Content-Type": "application/json",
        "Authorization": _auth_header(username, password),
    })
    try:
        with urlopen(req, timeout=timeout) as r:
            resp_text = r.read().decode("utf-8", errors="replace")
            try:
                return r.status < 400, json.loads(resp_text)
            except Exception:
                return r.status < 400, {"raw": resp_text}
    except URLError as e:
        return False, {"error": str(e)}
    except Exception as e:
        return False, {"error": str(e)}


def _base(ip: str, port: int) -> str:
    return f"http://{ip}:{int(port or 80)}"


# ── Device info ───────────────────────────────────────────────────────────────

def device_info_isapi(ip: str, port: int, username: str, password: str) -> dict:
    ok, resp = _xml_req(f"{_base(ip, port)}/ISAPI/System/deviceInfo",
                        "GET", "", username, password)
    if not ok:
        return {"ok": False, "message": resp}
    try:
        root = ET.fromstring(resp)
        ns = root.tag.split("}")[0].lstrip("{") if "}" in root.tag else ""
        def g(tag):
            el = root.find(f"{{{ns}}}{tag}" if ns else tag)
            return el.text if el is not None else None
        return {
            "ok": True,
            "model":           g("model"),
            "serial_number":   g("serialNumber"),
            "firmware":        g("firmwareVersion"),
            "device_name":     g("deviceName"),
            "device_type":     g("deviceType"),
        }
    except Exception as e:
        return {"ok": True, "raw": resp, "parse_error": str(e)}


def user_right_plan_template_get_isapi(
    ip: str,
    port: int,
    username: str,
    password: str,
    template_no: int,
) -> dict:
    """Read one controller user-right plan template without modifying it."""
    try:
        plan_no = int(template_no)
    except (TypeError, ValueError):
        return {"ok": False, "message": "Invalid plan template number"}
    if not 1 <= plan_no <= 255:
        return {"ok": False, "message": "Plan template number must be between 1 and 255"}
    try:
        response = requests.get(
            f"{_base(ip, port)}/ISAPI/AccessControl/UserRightPlanTemplate/{plan_no}?format=json",
            auth=HTTPDigestAuth(username or "admin", password or ""),
            timeout=8,
        )
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        template = payload.get("UserRightPlanTemplate") if isinstance(payload, dict) else None
        if response.status_code >= 400 or not isinstance(template, dict):
            return {
                "ok": False,
                "template_no": plan_no,
                "status_code": response.status_code,
                "message": (
                    payload.get("errorMsg")
                    if isinstance(payload, dict)
                    else None
                ) or f"Plan template {plan_no} is unavailable",
            }
        enabled = template.get("enable")
        enabled = enabled is True or str(enabled).lower() == "true"
        return {
            "ok": enabled,
            "exists": True,
            "enabled": enabled,
            "template_no": plan_no,
            "template_name": template.get("templateName") or f"Plan {plan_no}",
            "week_plan_no": template.get("weekPlanNo"),
            "holiday_group_no": template.get("holidayGroupNo"),
            "message": "ok" if enabled else f"Plan template {plan_no} is disabled",
        }
    except Exception as exc:
        return {
            "ok": False,
            "template_no": plan_no,
            "message": str(exc),
        }


def user_right_week_plan_get_isapi(
    ip: str,
    port: int,
    username: str,
    password: str,
    plan_no: int,
) -> dict:
    try:
        response = requests.get(
            f"{_base(ip, port)}/ISAPI/AccessControl/UserRightWeekPlanCfg/{int(plan_no)}?format=json",
            auth=HTTPDigestAuth(username or "admin", password or ""),
            timeout=8,
        )
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        plan = payload.get("UserRightWeekPlanCfg") if isinstance(payload, dict) else None
        ok = response.status_code < 400 and isinstance(plan, dict)
        return {
            "ok": ok,
            "plan_no": int(plan_no),
            "payload": payload if ok else {},
            "message": "ok" if ok else (
                payload.get("errorMsg") if isinstance(payload, dict) else None
            ) or f"Week plan {plan_no} is unavailable",
        }
    except Exception as exc:
        return {"ok": False, "plan_no": int(plan_no), "payload": {}, "message": str(exc)}


def _access_control_json_get(
    ip: str,
    port: int,
    username: str,
    password: str,
    resource: str,
    number: int,
    root_key: str,
) -> dict:
    try:
        response = requests.get(
            f"{_base(ip, port)}/ISAPI/AccessControl/{resource}/{int(number)}?format=json",
            auth=HTTPDigestAuth(username or "admin", password or ""),
            timeout=8,
        )
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        ok = response.status_code < 400 and isinstance(payload.get(root_key), dict)
        return {
            "ok": ok,
            "number": int(number),
            "payload": payload if ok else {},
            "message": "ok" if ok else (
                payload.get("errorMsg") if isinstance(payload, dict) else None
            ) or f"{resource} {number} is unavailable",
        }
    except Exception as exc:
        return {"ok": False, "number": int(number), "payload": {}, "message": str(exc)}


def user_right_holiday_plan_get_isapi(
    ip: str,
    port: int,
    username: str,
    password: str,
    plan_no: int,
) -> dict:
    return _access_control_json_get(
        ip, port, username, password,
        "UserRightHolidayPlanCfg", plan_no, "UserRightHolidayPlanCfg",
    )


def user_right_holiday_group_get_isapi(
    ip: str,
    port: int,
    username: str,
    password: str,
    group_no: int,
) -> dict:
    return _access_control_json_get(
        ip, port, username, password,
        "UserRightHolidayGroupCfg", group_no, "UserRightHolidayGroupCfg",
    )


def _access_control_json_put(
    ip: str,
    port: int,
    username: str,
    password: str,
    resource: str,
    number: int,
    payload: dict,
) -> dict:
    try:
        response = requests.put(
            f"{_base(ip, port)}/ISAPI/AccessControl/{resource}/{int(number)}?format=json",
            auth=HTTPDigestAuth(username or "admin", password or ""),
            json=payload,
            timeout=12,
        )
        try:
            body = response.json()
        except ValueError:
            body = {}
        status_code = body.get("statusCode") if isinstance(body, dict) else None
        ok = response.status_code < 400 and status_code in (None, 1)
        return {
            "ok": ok,
            "status_code": response.status_code,
            "device_status_code": status_code,
            "message": (
                "ok" if ok else
                body.get("errorMsg") or body.get("statusString") or response.text[:300]
            ),
        }
    except Exception as exc:
        return {"ok": False, "message": str(exc)}


def user_right_week_plan_set_isapi(
    ip: str,
    port: int,
    username: str,
    password: str,
    plan_no: int,
    payload: dict,
) -> dict:
    return _access_control_json_put(
        ip, port, username, password,
        "UserRightWeekPlanCfg", plan_no, payload,
    )


def user_right_plan_template_set_isapi(
    ip: str,
    port: int,
    username: str,
    password: str,
    template_no: int,
    *,
    name: str,
    week_plan_no: int,
    holiday_group_no: int | None = None,
) -> dict:
    payload = {
        "UserRightPlanTemplate": {
            "enable": True,
            "templateName": str(name or f"Plan {template_no}")[:32],
            "weekPlanNo": int(week_plan_no),
            "holidayGroupNo": (
                int(holiday_group_no) if holiday_group_no is not None else ""
            ),
        }
    }
    return _access_control_json_put(
        ip, port, username, password,
        "UserRightPlanTemplate", template_no, payload,
    )


def user_right_holiday_plan_set_isapi(
    ip: str,
    port: int,
    username: str,
    password: str,
    plan_no: int,
    payload: dict,
) -> dict:
    return _access_control_json_put(
        ip, port, username, password,
        "UserRightHolidayPlanCfg", plan_no, payload,
    )


def user_right_holiday_group_set_isapi(
    ip: str,
    port: int,
    username: str,
    password: str,
    group_no: int,
    *,
    name: str,
    holiday_plan_numbers: list[int],
) -> dict:
    payload = {
        "UserRightHolidayGroupCfg": {
            "enable": bool(holiday_plan_numbers),
            "groupName": str(name or f"Holiday Group {group_no}")[:32],
            "holidayPlanNo": ",".join(str(value) for value in holiday_plan_numbers),
        }
    }
    return _access_control_json_put(
        ip, port, username, password,
        "UserRightHolidayGroupCfg", group_no, payload,
    )


# ── Card management ───────────────────────────────────────────────────────────

def card_push_isapi(
    ip: str, port: int, username: str, password: str,
    card_number: str,
    employee_no: str = "",
    user_name: str = "",
    card_type: str = "normalCard",
    valid_begin: str = "",
    valid_end: str = "",
) -> dict:
    """Add or update a card on the ACS device."""
    payload = {
        "CardInfo": {
            "cardNo": str(card_number),
            "employeeNo": str(employee_no or card_number),
            "cardType": card_type,
        }
    }
    try:
        response = requests.put(
            f"{_base(ip, port)}/ISAPI/AccessControl/CardInfo/SetUp?format=json",
            auth=HTTPDigestAuth(username or "admin", password or ""),
            json=payload,
            timeout=10,
        )
        return {
            "ok": response.status_code < 400,
            "status_code": response.status_code,
            "message": "ok" if response.status_code < 400 else response.text[:300],
        }
    except Exception as exc:
        return {"ok": False, "message": str(exc)}


def card_delete_isapi(
    ip: str, port: int, username: str, password: str,
    card_number: str,
) -> dict:
    """Delete / revoke a card from the ACS device."""
    try:
        response = requests.put(
            f"{_base(ip, port)}/ISAPI/AccessControl/CardInfo/Delete?format=json",
            auth=HTTPDigestAuth(username or "admin", password or ""),
            json={"CardInfoDelCond": {"CardNoList": [{"cardNo": str(card_number)}]}},
            timeout=10,
        )
        return {
            "ok": response.status_code < 400,
            "status_code": response.status_code,
            "message": "ok" if response.status_code < 400 else response.text[:300],
        }
    except Exception as exc:
        return {"ok": False, "message": str(exc)}


def card_list_isapi(
    ip: str, port: int, username: str, password: str,
    offset: int = 0, limit: int = 50,
) -> dict:
    """Query cards stored on the device (paginated)."""
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<CardInfoSearchCond>
  <searchID>0</searchID>
  <SearchResultPosition>{offset}</SearchResultPosition>
  <maxResults>{limit}</maxResults>
</CardInfoSearchCond>"""

    ok, resp = _xml_req(
        f"{_base(ip, port)}/ISAPI/AccessControl/CardInfo/Search",
        "POST", xml, username, password,
    )
    if not ok:
        return {"ok": False, "cards": [], "message": resp[:300]}

    try:
        root = ET.fromstring(resp)
        ns = root.tag.split("}")[0].lstrip("{") if "}" in root.tag else ""
        def ns_tag(t): return f"{{{ns}}}{t}" if ns else t

        cards = []
        for card in root.iter(ns_tag("CardInfo")):
            def g(t):
                el = card.find(ns_tag(t))
                return el.text if el is not None else None
            cards.append({
                "card_number": g("cardNo"),
                "employee_no": g("employeeNo"),
                "name":        g("name"),
                "card_type":   g("cardType"),
                "valid_from":  g("startDate"),
                "valid_to":    g("endDate"),
            })
        return {"ok": True, "cards": cards}
    except Exception as e:
        return {"ok": True, "cards": [], "parse_error": str(e), "raw": resp[:500]}


# ── Door configuration ────────────────────────────────────────────────────────

def fingerprints_replace_isapi(
    ip: str,
    port: int,
    username: str,
    password: str,
    employee_no: str,
    fingerprints: list[dict],
) -> dict:
    """Upload all fingerprint templates for one employee."""
    auth = HTTPDigestAuth(username or "admin", password or "")
    base = f"{_base(ip, port)}/ISAPI/AccessControl/FingerPrintCfg"
    results = []
    try:
        for fingerprint in fingerprints:
            response = requests.put(
                base + "/SetUp?format=json",
                auth=auth,
                json={
                    "FingerPrintCfg": {
                        "employeeNo": str(employee_no),
                        "enableCardReader": [1, 0],
                        "fingerPrintID": int(fingerprint["finger_no"]),
                        "fingerType": "normalFP",
                        "fingerData": fingerprint["template"],
                    }
                },
                timeout=12,
            )
            results.append({
                "action": "upsert",
                "finger_no": int(fingerprint["finger_no"]),
                "ok": response.status_code < 400,
                "status_code": response.status_code,
                "message": "ok" if response.status_code < 400 else response.text[:250],
            })
    except Exception as exc:
        return {"ok": False, "message": str(exc), "results": results}
    return {"ok": all(item.get("ok") for item in results), "results": results}


def door_config_get(
    ip: str, port: int, username: str, password: str, door_no: int = 1,
) -> dict:
    ok, resp = _xml_req(
        f"{_base(ip, port)}/ISAPI/AccessControl/Door/doorParam?doorNo={door_no}",
        "GET", "", username, password,
    )
    if not ok:
        return {"ok": False, "message": resp[:300]}

    try:
        root = ET.fromstring(resp)
        ns = root.tag.split("}")[0].lstrip("{") if "}" in root.tag else ""
        def g(t):
            el = root.find(f"{{{ns}}}{t}" if ns else t)
            return el.text if el is not None else None
        return {
            "ok": True,
            "door_no":           door_no,
            "door_name":         g("name"),
            "open_duration":     g("openDuration"),       # seconds door stays open
            "lock_type":         g("lockType"),           # magneticLock / electricLock
            "open_alarm_timeout":g("openAlarmTimeout"),   # seconds before alarm
            "anti_passback":     g("antiPassbackEnable"),
            "raw_xml":           resp,
        }
    except Exception as e:
        return {"ok": True, "parse_error": str(e), "raw_xml": resp}


def door_config_set(
    ip: str, port: int, username: str, password: str,
    door_no: int, config: dict,
) -> dict:
    parts = []
    if "door_name"          in config: parts.append(f"<name>{config['door_name']}</name>")
    if "open_duration"      in config: parts.append(f"<openDuration>{config['open_duration']}</openDuration>")
    if "open_alarm_timeout" in config: parts.append(f"<openAlarmTimeout>{config['open_alarm_timeout']}</openAlarmTimeout>")
    if "anti_passback"      in config: parts.append(f"<antiPassbackEnable>{config['anti_passback']}</antiPassbackEnable>")
    if "lock_type"          in config: parts.append(f"<lockType>{config['lock_type']}</lockType>")

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<DoorParam>
  <doorNo>{door_no}</doorNo>
  {''.join(parts)}
</DoorParam>"""

    ok, resp = _xml_req(
        f"{_base(ip, port)}/ISAPI/AccessControl/Door/doorParam?doorNo={door_no}",
        "PUT", xml, username, password,
    )
    return {"ok": ok, "message": resp[:300] if not ok else "ok"}


# ── Face sync ─────────────────────────────────────────────────────────────────

def face_sync_isapi(
    ip: str, port: int, username: str, password: str,
    employee_no: str,
    face_image_bytes: bytes,
) -> dict:
    """Push a face image to the device face library."""
    import io, uuid

    boundary = uuid.uuid4().hex
    metadata = json.dumps({
        "faceLibType": "blackFD",
        "FDID":        "1",
        "FPID":        employee_no,
    })

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="FaceDataRecord"\r\n'
        f"Content-Type: application/json\r\n\r\n"
        f"{metadata}\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="FaceImage"; filename="face.jpg"\r\n'
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8") + face_image_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = _Req(
        f"{_base(ip, port)}/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Authorization": _auth_header(username, password),
        },
    )
    try:
        with urlopen(req, timeout=15) as r:
            resp = r.read().decode("utf-8", errors="replace")
            ok = r.status < 400
            try:
                return {"ok": ok, **json.loads(resp)}
            except Exception:
                return {"ok": ok, "raw": resp}
    except URLError as e:
        return {"ok": False, "message": str(e)}
    except Exception as e:
        return {"ok": False, "message": str(e)}


# ── ACS event query from device ───────────────────────────────────────────────

def acs_events_query_isapi(
    ip: str, port: int, username: str, password: str,
    major: int = 5,    # 5 = access control events
    start_time: str = "",
    end_time: str = "",
    max_results: int = 50,
) -> dict:
    """Query ACS events from device (card swipes, alarms, etc.)."""
    try:
        condition = {
            "searchID": f"events-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            "searchResultPosition": 0,
            "maxResults": max_results,
            "major": major,
            "minor": 0,
            "timeReverseOrder": True,
        }
        if start_time:
            condition["startTime"] = start_time
        if end_time:
            condition["endTime"] = end_time

        response = requests.post(
            f"{_base(ip, port)}/ISAPI/AccessControl/AcsEvent?format=json",
            auth=HTTPDigestAuth(username or "admin", password or ""),
            json={"AcsEventCond": condition},
            timeout=10,
        )
        if response.status_code >= 400:
            return {
                "ok": False,
                "events": [],
                "message": f"HTTP {response.status_code}: {response.text[:250]}",
            }

        data = response.json()
        events = []
        for ev in data.get("AcsEvent", {}).get("InfoList", []):
            events.append({
                "card_number":  ev.get("cardNo"),
                "employee_no":  ev.get("employeeNoString"),
                "name":         ev.get("name"),
                "door_no":      ev.get("doorNo"),
                "event_type":   ev.get("major"),
                "minor_type":   ev.get("minor"),
                "time":         ev.get("time"),
                "verify_mode":  ev.get("currentVerifyMode"),
                "serial_no":    ev.get("serialNo"),
                "face_rect":    ev.get("FaceRect"),
            })
        return {"ok": True, "events": events}
    except Exception as e:
        return {"ok": False, "events": [], "message": str(e)}


# ── Multi-door interlock ──────────────────────────────────────────────────────

def interlock_get(ip: str, port: int, username: str, password: str) -> dict:
    ok, resp = _xml_req(
        f"{_base(ip, port)}/ISAPI/AccessControl/MultiDoorInterlockCfg",
        "GET", "", username, password,
    )
    if not ok:
        return {"ok": False, "message": resp[:300]}
    try:
        root = ET.fromstring(resp)
        ns = root.tag.split("}")[0].lstrip("{") if "}" in root.tag else ""
        def g(t):
            el = root.find(f"{{{ns}}}{t}" if ns else t)
            return el.text if el is not None else None
        enabled = g("enabled") or g("interlockEnable")
        groups = []
        for grp in root.iter(f"{{{ns}}}InterlockGroup" if ns else "InterlockGroup"):
            doors = [el.text for el in grp.iter(f"{{{ns}}}doorNo" if ns else "doorNo")]
            groups.append(doors)
        return {"ok": True, "enabled": enabled, "groups": groups, "raw_xml": resp}
    except Exception as e:
        return {"ok": True, "parse_error": str(e), "raw_xml": resp}


def interlock_set(ip: str, port: int, username: str, password: str,
                  enabled: bool, groups: list[list[int]]) -> dict:
    grp_xml = ""
    for i, doors in enumerate(groups, 1):
        doors_xml = "".join(f"<doorNo>{d}</doorNo>" for d in doors)
        grp_xml += f"<InterlockGroup><groupNo>{i}</groupNo>{doors_xml}</InterlockGroup>"

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<MultiDoorInterlockCfg>
  <enabled>{'true' if enabled else 'false'}</enabled>
  {grp_xml}
</MultiDoorInterlockCfg>"""

    ok, resp = _xml_req(
        f"{_base(ip, port)}/ISAPI/AccessControl/MultiDoorInterlockCfg",
        "PUT", xml, username, password,
    )
    return {"ok": ok, "message": resp[:300] if not ok else "ok"}
