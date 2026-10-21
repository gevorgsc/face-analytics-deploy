"""Hikvision HCNetSDK wrapper for SDK-backed snapshots/live preview.

Windows uses the Network SDK DLLs under backend/SDK/lib. Linux deployments need
the Hikvision Linux HCNetSDK shared libraries copied into the same directory.
The browser live view is exposed as MJPEG from SDK RealPlay/PlayCtrl frames.
"""

import asyncio
import ctypes
import json
import logging
import os
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator

import cv2
import numpy as np
import requests
from requests.auth import HTTPDigestAuth

logger = logging.getLogger(__name__)

DWORD = ctypes.c_uint32
WORD = ctypes.c_uint16
BYTE = ctypes.c_ubyte
BOOL = ctypes.c_int
# HCNetSDK defines LONG as ``int`` on Linux (see HCNetSDK.h), not as the
# platform C ``long``.  Using ``c_long`` on 64-bit Linux made SDK structures
# such as NET_DVR_PREVIEWINFO eight bytes wider at their first field and
# shifted every following member.
LONG = ctypes.c_int32
SHORT = ctypes.c_int16

SERIALNO_LEN = 48

SDK_ROOT = Path(__file__).resolve().parents[1] / "SDK"
SDK_LIB_DIR = SDK_ROOT / "lib"
SDK_COM_DIR = SDK_LIB_DIR / "HCNetSDKCom"

_sdk_lock = threading.Lock()
_sdk = None
_play = None
_sdk_initialized = False
_IS_WINDOWS = sys.platform.startswith("win")
_CALLBACK = ctypes.WINFUNCTYPE if _IS_WINDOWS else ctypes.CFUNCTYPE

NET_DVR_SYSHEAD = 1
NET_DVR_STREAMDATA = 2
T_YV12 = 3

ACS_CARD_NO_LEN = 32
ACS_NAME_LEN = 32
MAX_DOOR_NUM_256 = 256
MAX_GROUP_NUM_128 = 128
CARD_PASSWORD_LEN = 8
NET_DVR_SET_CARD = 2561
NET_DVR_DEL_CARD = 2562
NET_DVR_SET_FACE = 2567
NET_DVR_CAPTURE_FACE_INFO = 2510
NET_DVR_CAPTURE_FINGERPRINT_INFO = 2504
MAX_FINGER_PRINT_LEN = 768
NET_SDK_GET_NEXT_STATUS_SUCCESS = 1000
NET_SDK_GET_NEXT_STATUS_NEED_WAIT = 1001
NET_SDK_GET_NEXT_STATUS_FINISH = 1002
NET_SDK_GET_NEXT_STATUS_FAILED = 1003
NET_SDK_GET_NEXT_STATUS_EXCEPTION = 1004
NET_SDK_CONFIG_STATUS_SUCCESS = 1000
NET_SDK_CONFIG_STATUS_NEEDWAIT = 1001
NET_SDK_CONFIG_STATUS_FINISH = 1002


class NET_DVR_DEVICEINFO_V30(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("sSerialNumber", BYTE * SERIALNO_LEN),
        ("byAlarmInPortNum", BYTE),
        ("byAlarmOutPortNum", BYTE),
        ("byDiskNum", BYTE),
        ("byDVRType", BYTE),
        ("byChanNum", BYTE),
        ("byStartChan", BYTE),
        ("byAudioChanNum", BYTE),
        ("byIPChanNum", BYTE),
        ("byZeroChanNum", BYTE),
        ("byMainProto", BYTE),
        ("bySubProto", BYTE),
        ("bySupport", BYTE),
        ("bySupport1", BYTE),
        ("bySupport2", BYTE),
        ("wDevType", WORD),
        ("bySupport3", BYTE),
        ("byMultiStreamProto", BYTE),
        ("byStartDChan", BYTE),
        ("byStartDTalkChan", BYTE),
        ("byHighDChanNum", BYTE),
        ("bySupport4", BYTE),
        ("byLanguageType", BYTE),
        ("byVoiceInChanNum", BYTE),
        ("byStartVoiceInChanNo", BYTE),
        ("bySupport5", BYTE),
        ("bySupport6", BYTE),
        ("byMirrorChanNum", BYTE),
        ("wStartMirrorChanNo", WORD),
        ("bySupport7", BYTE),
        ("byRes2", BYTE),
    ]


class NET_DVR_JPEGPARA(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("wPicSize", WORD),
        ("wPicQuality", WORD),
    ]


class NET_DVR_TIME_EX(ctypes.Structure):
    _fields_ = [
        ("wYear", WORD),
        ("byMonth", BYTE),
        ("byDay", BYTE),
        ("byHour", BYTE),
        ("byMinute", BYTE),
        ("bySecond", BYTE),
        ("byRes", BYTE),
    ]


class NET_DVR_VALID_PERIOD_CFG(ctypes.Structure):
    _fields_ = [
        ("byEnable", BYTE),
        ("byBeginTimeFlag", BYTE),
        ("byEnableTimeFlag", BYTE),
        ("byTimeDurationNo", BYTE),
        ("struBeginTime", NET_DVR_TIME_EX),
        ("struEndTime", NET_DVR_TIME_EX),
        ("byTimeType", BYTE),
        ("byRes2", BYTE * 31),
    ]


class NET_DVR_CARD_COND(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("dwCardNum", DWORD),
        ("byRes", BYTE * 64),
    ]


class NET_DVR_CARD_RECORD(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("byCardNo", BYTE * ACS_CARD_NO_LEN),
        ("byCardType", BYTE),
        ("byLeaderCard", BYTE),
        ("byUserType", BYTE),
        ("byRes1", BYTE),
        ("byDoorRight", BYTE * MAX_DOOR_NUM_256),
        ("struValid", NET_DVR_VALID_PERIOD_CFG),
        ("byBelongGroup", BYTE * MAX_GROUP_NUM_128),
        ("byCardPassword", BYTE * CARD_PASSWORD_LEN),
        ("wCardRightPlan", WORD * MAX_DOOR_NUM_256),
        ("dwMaxSwipeTimes", DWORD),
        ("dwSwipeTimes", DWORD),
        ("dwEmployeeNo", DWORD),
        ("byName", BYTE * ACS_NAME_LEN),
        ("dwCardRight", DWORD),
        ("byRes", BYTE * 256),
    ]


class NET_DVR_CARD_SEND_DATA(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("byCardNo", BYTE * ACS_CARD_NO_LEN),
        ("byRes", BYTE * 16),
    ]


class NET_DVR_CARD_STATUS(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("byCardNo", BYTE * ACS_CARD_NO_LEN),
        ("dwErrorCode", DWORD),
        ("byStatus", BYTE),
        ("byRes", BYTE * 23),
    ]


class NET_DVR_FACE_COND(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("byCardNo", BYTE * ACS_CARD_NO_LEN),
        ("dwFaceNum", DWORD),
        ("dwEnableReaderNo", DWORD),
        ("byRes", BYTE * 124),
    ]


class NET_DVR_FACE_RECORD(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("byCardNo", BYTE * ACS_CARD_NO_LEN),
        ("dwFaceLen", DWORD),
        ("pFaceBuffer", ctypes.POINTER(BYTE)),
        ("byRes", BYTE * 128),
    ]


class NET_DVR_FACE_STATUS(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("byCardNo", BYTE * ACS_CARD_NO_LEN),
        ("byErrorMsg", BYTE * 32),
        ("dwReaderNo", DWORD),
        ("byRecvStatus", BYTE),
        ("byRes", BYTE * 131),
    ]


class NET_VCA_POINT(ctypes.Structure):
    _fields_ = [
        ("fX", ctypes.c_float),
        ("fY", ctypes.c_float),
    ]


class NET_VCA_RECT(ctypes.Structure):
    _fields_ = [
        ("fX", ctypes.c_float),
        ("fY", ctypes.c_float),
        ("fWidth", ctypes.c_float),
        ("fHeight", ctypes.c_float),
    ]


class NET_DVR_FACE_FEATURE(ctypes.Structure):
    _fields_ = [
        ("struFace", NET_VCA_RECT),
        ("struLeftEye", NET_VCA_POINT),
        ("struRightEye", NET_VCA_POINT),
        ("struLeftMouth", NET_VCA_POINT),
        ("struRightMouth", NET_VCA_POINT),
        ("struNoseTip", NET_VCA_POINT),
    ]


class NET_DVR_CAPTURE_FACE_COND(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("byRes", BYTE * 128),
    ]


class NET_DVR_CAPTURE_FACE_CFG(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("dwFaceTemplate1Size", DWORD),
        ("pFaceTemplate1Buffer", ctypes.c_void_p),
        ("dwFaceTemplate2Size", DWORD),
        ("pFaceTemplate2Buffer", ctypes.c_void_p),
        ("dwFacePicSize", DWORD),
        ("pFacePicBuffer", ctypes.c_void_p),
        ("byFaceQuality1", BYTE),
        ("byFaceQuality2", BYTE),
        ("byCaptureProgress", BYTE),
        ("byFacePicQuality", BYTE),
        ("dwInfraredFacePicSize", DWORD),
        ("pInfraredFacePicBuffer", ctypes.c_void_p),
        ("byInfraredFacePicQuality", BYTE),
        ("byRes1", BYTE * 3),
        ("struFeature", NET_DVR_FACE_FEATURE),
        ("byRes", BYTE * 56),
    ]


class NET_DVR_CAPTURE_FINGERPRINT_COND(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("byFingerPrintPicType", BYTE),
        ("byFingerNo", BYTE),
        ("byRes", BYTE * 126),
    ]


class NET_DVR_CAPTURE_FINGERPRINT_CFG(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("dwFingerPrintDataSize", DWORD),
        ("byFingerData", BYTE * MAX_FINGER_PRINT_LEN),
        ("dwFingerPrintPicSize", DWORD),
        ("pFingerPrintPicBuffer", ctypes.c_void_p),
        ("byFingerNo", BYTE),
        ("byFingerPrintQuality", BYTE),
        ("byRes", BYTE * 62),
    ]


class FRAME_INFO(ctypes.Structure):
    _fields_ = [
        ("nWidth", LONG),
        ("nHeight", LONG),
        ("nStamp", LONG),
        ("nType", LONG),
        ("nFrameRate", LONG),
        ("dwFrameNum", DWORD),
    ]


class NET_DVR_PREVIEWINFO(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("lChannel", LONG),
        ("dwStreamType", DWORD),
        ("dwLinkMode", DWORD),
        ("hPlayWnd", ctypes.c_void_p),
        ("bBlocked", DWORD),
        ("bPassbackRecord", DWORD),
        ("byPreviewMode", BYTE),
        ("byStreamID", BYTE * 32),
        ("byProtoType", BYTE),
        ("byRes1", BYTE),
        ("byVideoCodingType", BYTE),
        ("dwDisplayBufNum", DWORD),
        ("byNPQMode", BYTE),
        ("byRecvMetaData", BYTE),
        ("byDataType", BYTE),
        ("byRes", BYTE * 213),
    ]


REALDATACALLBACK = _CALLBACK(
    None,
    LONG,
    DWORD,
    ctypes.POINTER(BYTE),
    DWORD,
    ctypes.c_void_p,
)

DECCALLBACK = _CALLBACK(
    None,
    LONG,
    ctypes.c_void_p,
    LONG,
    ctypes.POINTER(FRAME_INFO),
    LONG,
    LONG,
)


def _add_dll_dirs() -> None:
    for path in (SDK_LIB_DIR, SDK_COM_DIR):
        if path.exists() and _IS_WINDOWS:
            os.add_dll_directory(str(path))


def _load_sdk():
    global _sdk, _sdk_initialized
    with _sdk_lock:
        if _sdk is not None:
            return _sdk

        lib_name = "HCNetSDK.dll" if _IS_WINDOWS else "libhcnetsdk.so"
        dll_path = SDK_LIB_DIR / lib_name
        if not dll_path.exists():
            raise RuntimeError(f"{lib_name} not found at {dll_path}")

        _add_dll_dirs()
        sdk = ctypes.WinDLL(str(dll_path)) if _IS_WINDOWS else ctypes.CDLL(str(dll_path))

        sdk.NET_DVR_Init.argtypes = []
        sdk.NET_DVR_Init.restype = BOOL

        sdk.NET_DVR_Cleanup.argtypes = []
        sdk.NET_DVR_Cleanup.restype = BOOL

        sdk.NET_DVR_GetLastError.argtypes = []
        sdk.NET_DVR_GetLastError.restype = DWORD

        sdk.NET_DVR_SetConnectTime.argtypes = [DWORD, DWORD]
        sdk.NET_DVR_SetConnectTime.restype = BOOL

        sdk.NET_DVR_SetRecvTimeOut.argtypes = [DWORD]
        sdk.NET_DVR_SetRecvTimeOut.restype = BOOL

        sdk.NET_DVR_Login_V30.argtypes = [
            ctypes.c_char_p,
            WORD,
            ctypes.c_char_p,
            ctypes.c_char_p,
            ctypes.POINTER(NET_DVR_DEVICEINFO_V30),
        ]
        sdk.NET_DVR_Login_V30.restype = LONG

        sdk.NET_DVR_Logout.argtypes = [LONG]
        sdk.NET_DVR_Logout.restype = BOOL

        sdk.NET_DVR_CaptureJPEGPicture_NEW.argtypes = [
            LONG,
            LONG,
            ctypes.POINTER(NET_DVR_JPEGPARA),
            ctypes.c_void_p,
            DWORD,
            ctypes.POINTER(DWORD),
        ]
        sdk.NET_DVR_CaptureJPEGPicture_NEW.restype = BOOL

        sdk.NET_DVR_RealPlay_V40.argtypes = [
            LONG,
            ctypes.POINTER(NET_DVR_PREVIEWINFO),
            REALDATACALLBACK,
            ctypes.c_void_p,
        ]
        sdk.NET_DVR_RealPlay_V40.restype = LONG

        sdk.NET_DVR_StopRealPlay.argtypes = [LONG]
        sdk.NET_DVR_StopRealPlay.restype = BOOL

        # SDK-native archive recording.  The camera itself provides the live
        # stream to HCNetSDK; no RTSP URL or external stream connection is used.
        sdk.NET_DVR_SaveRealData.argtypes = [LONG, ctypes.c_char_p]
        sdk.NET_DVR_SaveRealData.restype = BOOL

        sdk.NET_DVR_StopSaveRealData.argtypes = [LONG]
        sdk.NET_DVR_StopSaveRealData.restype = BOOL

        sdk.NET_DVR_SaveRealData_V30.argtypes = [LONG, DWORD, ctypes.c_char_p]
        sdk.NET_DVR_SaveRealData_V30.restype = BOOL

        sdk.NET_DVR_StartRemoteConfig.argtypes = [
            LONG, DWORD, ctypes.c_void_p, DWORD, ctypes.c_void_p, ctypes.c_void_p,
        ]
        sdk.NET_DVR_StartRemoteConfig.restype = LONG

        sdk.NET_DVR_SendWithRecvRemoteConfig.argtypes = [
            LONG, ctypes.c_void_p, DWORD, ctypes.c_void_p, DWORD, ctypes.POINTER(DWORD),
        ]
        sdk.NET_DVR_SendWithRecvRemoteConfig.restype = LONG

        sdk.NET_DVR_GetNextRemoteConfig.argtypes = [
            LONG, ctypes.c_void_p, DWORD,
        ]
        sdk.NET_DVR_GetNextRemoteConfig.restype = LONG

        sdk.NET_DVR_StopRemoteConfig.argtypes = [LONG]
        sdk.NET_DVR_StopRemoteConfig.restype = BOOL

        if not sdk.NET_DVR_Init():
            raise RuntimeError(f"HCNetSDK init failed: error={sdk.NET_DVR_GetLastError()}")
        _sdk_initialized = True
        sdk.NET_DVR_SetConnectTime(5000, 2)
        sdk.NET_DVR_SetRecvTimeOut(5000)
        _sdk = sdk
        logger.info("HCNetSDK loaded from %s", dll_path)
        return _sdk


def _load_playctrl():
    global _play
    with _sdk_lock:
        if _play is not None:
            return _play

        lib_name = "PlayCtrl.dll" if _IS_WINDOWS else "libPlayCtrl.so"
        dll_path = SDK_LIB_DIR / lib_name
        if not dll_path.exists():
            raise RuntimeError(f"{lib_name} not found at {dll_path}")

        _add_dll_dirs()
        play = ctypes.WinDLL(str(dll_path)) if _IS_WINDOWS else ctypes.CDLL(str(dll_path))

        play.PlayM4_GetPort.argtypes = [ctypes.POINTER(LONG)]
        play.PlayM4_GetPort.restype = BOOL

        play.PlayM4_FreePort.argtypes = [LONG]
        play.PlayM4_FreePort.restype = BOOL

        play.PlayM4_OpenStream.argtypes = [LONG, ctypes.c_void_p, DWORD, DWORD]
        play.PlayM4_OpenStream.restype = BOOL

        play.PlayM4_CloseStream.argtypes = [LONG]
        play.PlayM4_CloseStream.restype = BOOL

        play.PlayM4_InputData.argtypes = [LONG, ctypes.c_void_p, DWORD]
        play.PlayM4_InputData.restype = BOOL

        play.PlayM4_SetDecCallBack.argtypes = [LONG, DECCALLBACK]
        play.PlayM4_SetDecCallBack.restype = BOOL

        play.PlayM4_Play.argtypes = [LONG, ctypes.c_void_p]
        play.PlayM4_Play.restype = BOOL

        play.PlayM4_Stop.argtypes = [LONG]
        play.PlayM4_Stop.restype = BOOL

        if hasattr(play, "PlayM4_GetLastError"):
            play.PlayM4_GetLastError.argtypes = [LONG]
            play.PlayM4_GetLastError.restype = DWORD

        _play = play
        logger.info("PlayCtrl loaded from %s", dll_path)
        return _play


def _sdk_error(prefix: str) -> RuntimeError:
    sdk = _load_sdk()
    return RuntimeError(f"{prefix}: HCNetSDK error={sdk.NET_DVR_GetLastError()}")


def _sdk_channel(channel: int) -> int:
    # RTSP/ISAPI commonly use 101/102 for channel 1 main/sub stream.
    if channel >= 100:
        return max(1, channel // 100)
    return max(1, channel)


def _set_byte_array(target, value: str, *, encoding: str = "utf-8") -> None:
    raw = (value or "").encode(encoding)[: len(target)]
    for index, byte in enumerate(raw):
        target[index] = byte


def _fill_sdk_time(target: NET_DVR_TIME_EX, value: datetime | None, fallback: datetime) -> None:
    dt = value or fallback
    target.wYear = dt.year
    target.byMonth = dt.month
    target.byDay = dt.day
    target.byHour = dt.hour
    target.byMinute = dt.minute
    target.bySecond = dt.second


def _sdk_login(ip: str, sdk_port: int, username: str, password: str):
    sdk = _load_sdk()
    info = NET_DVR_DEVICEINFO_V30()
    user_id = sdk.NET_DVR_Login_V30(
        ip.encode("utf-8"),
        int(sdk_port or 8000),
        (username or "admin").encode("utf-8"),
        (password or "").encode("utf-8"),
        ctypes.byref(info),
    )
    if user_id < 0:
        raise _sdk_error("SDK login failed")
    return sdk, user_id


def acs_probe_device_sync(ip: str, sdk_port: int, username: str, password: str) -> dict:
    """Verify HCNetSDK credentials and return basic controller identity."""
    sdk = _load_sdk()
    info = NET_DVR_DEVICEINFO_V30()
    user_id = sdk.NET_DVR_Login_V30(
        ip.encode("utf-8"),
        int(sdk_port or 8000),
        (username or "admin").encode("utf-8"),
        (password or "").encode("utf-8"),
        ctypes.byref(info),
    )
    if user_id < 0:
        error_code = int(sdk.NET_DVR_GetLastError())
        return {
            "ok": False,
            "online": False,
            "error_code": error_code,
            "message": f"HCNetSDK login failed (error {error_code})",
        }

    try:
        serial_raw = bytes(info.sSerialNumber).split(b"\0", 1)[0]
        return {
            "ok": True,
            "online": True,
            "message": "HCNetSDK connection successful",
            "serial_number": serial_raw.decode("utf-8", errors="replace").strip(),
            "device_type": int(info.wDevType),
            "dvr_type": int(info.byDVRType),
            "channel_count": int(info.byChanNum) + int(info.byIPChanNum),
            "alarm_input_count": int(info.byAlarmInPortNum),
            "alarm_output_count": int(info.byAlarmOutPortNum),
        }
    finally:
        sdk.NET_DVR_Logout(user_id)


def _send_remote_record(sdk, handle: int, record, status, timeout: float = 12.0) -> dict:
    deadline = time.monotonic() + timeout
    out_len = DWORD(0)
    while time.monotonic() < deadline:
        result = sdk.NET_DVR_SendWithRecvRemoteConfig(
            handle,
            ctypes.byref(record),
            ctypes.sizeof(record),
            ctypes.byref(status),
            ctypes.sizeof(status),
            ctypes.byref(out_len),
        )
        if result == NET_SDK_CONFIG_STATUS_SUCCESS:
            return {"ok": bool(getattr(status, "byStatus", getattr(status, "byRecvStatus", 1))),
                    "error_code": int(getattr(status, "dwErrorCode", 0))}
        if result == NET_SDK_CONFIG_STATUS_FINISH:
            return {"ok": True, "error_code": 0}
        if result != NET_SDK_CONFIG_STATUS_NEEDWAIT:
            return {"ok": False, "error_code": int(sdk.NET_DVR_GetLastError()),
                    "message": f"Remote config failed with status {result}"}
        time.sleep(0.05)
    return {"ok": False, "error_code": None, "message": "Remote config timed out"}


def acs_person_upsert_sdk_sync(
    ip: str,
    sdk_port: int,
    username: str,
    password: str,
    *,
    employee_no: str,
    full_name: str,
    card_number: str,
    pin_code: str = "",
    valid_from: datetime | None = None,
    valid_to: datetime | None = None,
    door_numbers: list[int] | None = None,
    max_access_times: int | None = None,
    device_administrator: bool = False,
) -> dict:
    """Create/update a person credential through HCNetSDK remote configuration."""
    if not card_number:
        return {"ok": False, "message": "A card number is required for HCNetSDK person provisioning"}

    sdk, user_id = _sdk_login(ip, sdk_port, username, password)
    cond = NET_DVR_CARD_COND()
    cond.dwSize = ctypes.sizeof(cond)
    cond.dwCardNum = 1
    handle = sdk.NET_DVR_StartRemoteConfig(
        user_id, NET_DVR_SET_CARD, ctypes.byref(cond), ctypes.sizeof(cond), None, None,
    )
    if handle < 0:
        sdk.NET_DVR_Logout(user_id)
        raise _sdk_error("SDK card remote config failed to start")

    try:
        record = NET_DVR_CARD_RECORD()
        record.dwSize = ctypes.sizeof(record)
        _set_byte_array(record.byCardNo, card_number)
        record.byCardType = 9
        record.byUserType = 1 if device_administrator else 0
        for door_no in (door_numbers or [1]):
            if 1 <= int(door_no) <= MAX_DOOR_NUM_256:
                record.byDoorRight[int(door_no) - 1] = 1
                record.wCardRightPlan[int(door_no) - 1] = 1
        record.struValid.byEnable = 1
        now = datetime.now()
        _fill_sdk_time(record.struValid.struBeginTime, valid_from, now)
        _fill_sdk_time(record.struValid.struEndTime, valid_to, datetime(2036, 12, 31, 23, 59, 59))
        _set_byte_array(record.byCardPassword, pin_code)
        try:
            record.dwEmployeeNo = int(employee_no)
        except (TypeError, ValueError):
            record.dwEmployeeNo = 0
        _set_byte_array(record.byName, full_name)
        record.dwMaxSwipeTimes = max(0, int(max_access_times or 0))

        status = NET_DVR_CARD_STATUS()
        status.dwSize = ctypes.sizeof(status)
        result = _send_remote_record(sdk, handle, record, status)
        result.update({"card_number": card_number, "employee_no": employee_no})
        return result
    finally:
        sdk.NET_DVR_StopRemoteConfig(handle)
        sdk.NET_DVR_Logout(user_id)


def acs_face_upsert_sdk_sync(
    ip: str,
    sdk_port: int,
    username: str,
    password: str,
    *,
    card_number: str,
    face_image_bytes: bytes,
) -> dict:
    """Upload one face picture for a provisioned card through HCNetSDK."""
    if not card_number or not face_image_bytes:
        return {"ok": False, "message": "card_number and face image are required"}

    sdk, user_id = _sdk_login(ip, sdk_port, username, password)
    cond = NET_DVR_FACE_COND()
    cond.dwSize = ctypes.sizeof(cond)
    _set_byte_array(cond.byCardNo, card_number)
    cond.dwFaceNum = 1
    cond.dwEnableReaderNo = 0xFFFFFFFF
    handle = sdk.NET_DVR_StartRemoteConfig(
        user_id, NET_DVR_SET_FACE, ctypes.byref(cond), ctypes.sizeof(cond), None, None,
    )
    if handle < 0:
        sdk.NET_DVR_Logout(user_id)
        raise _sdk_error("SDK face remote config failed to start")

    image_buffer = (BYTE * len(face_image_bytes)).from_buffer_copy(face_image_bytes)
    try:
        record = NET_DVR_FACE_RECORD()
        record.dwSize = ctypes.sizeof(record)
        _set_byte_array(record.byCardNo, card_number)
        record.dwFaceLen = len(face_image_bytes)
        record.pFaceBuffer = ctypes.cast(image_buffer, ctypes.POINTER(BYTE))
        status = NET_DVR_FACE_STATUS()
        status.dwSize = ctypes.sizeof(status)
        result = _send_remote_record(sdk, handle, record, status, timeout=20.0)
        result["card_number"] = card_number
        return result
    finally:
        sdk.NET_DVR_StopRemoteConfig(handle)
        sdk.NET_DVR_Logout(user_id)


def _isapi_response(response: requests.Response, operation: str) -> dict:
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    status_code = payload.get("statusCode")
    ok = response.ok and (status_code in (None, 1))
    result = {
        "ok": ok,
        "http_status": response.status_code,
        "status_code": status_code,
        "status_string": payload.get("statusString"),
        "sub_status_code": payload.get("subStatusCode"),
    }
    if not ok:
        result["message"] = (
            payload.get("errorMsg")
            or payload.get("statusString")
            or f"{operation} failed (HTTP {response.status_code})"
        )
    return result


def _isapi_base(ip: str, http_port: int) -> str:
    return f"http://{ip}:{int(http_port or 80)}"


def acs_person_upsert_isapi_sync(
    ip: str,
    http_port: int,
    username: str,
    password: str,
    *,
    employee_no: str,
    full_name: str,
    card_number: str = "",
    pin_code: str = "",
    valid_from: datetime | None = None,
    valid_to: datetime | None = None,
    door_numbers: list[int] | None = None,
    right_plans: dict[int, int] | None = None,
    device_administrator: bool = False,
) -> dict:
    """Create/update a modern ACS user; a card is an optional credential."""
    auth = HTTPDigestAuth(username or "admin", password or "")
    doors = sorted({max(1, int(value)) for value in (door_numbers or [1])})
    normalized_plans = {
        int(door_no): int(plan_no)
        for door_no, plan_no in (right_plans or {}).items()
    }
    missing_plans = [door_no for door_no in doors if door_no not in normalized_plans]
    if missing_plans:
        return {
            "ok": False,
            "employee_no": employee_no,
            "message": (
                "Access schedule is not mapped to a controller plan template "
                f"for door(s): {', '.join(map(str, missing_plans))}"
            ),
            "schedule_error": "unmapped",
        }
    invalid_plans = {
        door_no: plan_no
        for door_no, plan_no in normalized_plans.items()
        if plan_no < 1 or plan_no > 255
    }
    if invalid_plans:
        return {
            "ok": False,
            "employee_no": employee_no,
            "message": "Controller plan template numbers must be between 1 and 255",
            "schedule_error": "invalid",
        }
    begin = (valid_from or datetime.now()).strftime("%Y-%m-%dT%H:%M:%S")
    end = (valid_to or datetime(2036, 12, 31, 23, 59, 59)).strftime("%Y-%m-%dT%H:%M:%S")
    user_info = {
        "employeeNo": str(employee_no),
        "name": full_name or str(employee_no),
        "userType": "normal",
        "Valid": {"enable": True, "beginTime": begin, "endTime": end},
        "doorRight": ",".join(str(value) for value in doors),
        "RightPlan": [
            {"doorNo": value, "planTemplateNo": str(normalized_plans[value])}
            for value in doors
        ],
    }
    if device_administrator:
        user_info["localUIRight"] = True
    if pin_code:
        user_info["password"] = str(pin_code)
    response = requests.put(
        _isapi_base(ip, http_port) + "/ISAPI/AccessControl/UserInfo/SetUp?format=json",
        auth=auth,
        json={"UserInfo": user_info},
        timeout=15,
    )
    result = _isapi_response(response, "Person provisioning")
    result["employee_no"] = employee_no
    if not result["ok"] or not card_number:
        return result

    card_response = requests.put(
        _isapi_base(ip, http_port) + "/ISAPI/AccessControl/CardInfo/SetUp?format=json",
        auth=auth,
        json={"CardInfo": {
            "employeeNo": str(employee_no),
            "cardNo": str(card_number),
            "cardType": "normalCard",
        }},
        timeout=15,
    )
    card_result = _isapi_response(card_response, "Card provisioning")
    result["card"] = card_result
    result["ok"] = bool(result["ok"] and card_result["ok"])
    return result


def acs_face_upsert_isapi_sync(
    ip: str,
    http_port: int,
    username: str,
    password: str,
    *,
    employee_no: str,
    full_name: str,
    gender: str,
    face_image_bytes: bytes,
) -> dict:
    """Attach a JPEG face to an ACS user through the device FD library."""
    if not face_image_bytes:
        return {"ok": False, "message": "A face image is required"}
    auth = HTTPDigestAuth(username or "admin", password or "")
    record = {
        "faceLibType": "blackFD",
        "FDID": "1",
        "FPID": str(employee_no),
        "name": full_name or str(employee_no),
        "gender": gender if gender in {"male", "female", "unknown"} else "unknown",
    }
    files = {
        "FaceDataRecord": (None, json.dumps(record), "application/json"),
        "FaceImage": ("face.jpg", face_image_bytes, "image/jpeg"),
    }
    base = _isapi_base(ip, http_port)
    response = requests.post(
        base + "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
        auth=auth,
        files=files,
        timeout=25,
    )
    result = _isapi_response(response, "Face provisioning")
    if result["ok"]:
        result["employee_no"] = employee_no
        return result

    files = {
        "FaceDataRecord": (None, json.dumps(record), "application/json"),
        "FaceImage": ("face.jpg", face_image_bytes, "image/jpeg"),
    }
    response = requests.put(
        base + (
            "/ISAPI/Intelligent/FDLib/FDSearch?format=json"
            f"&FDID=1&FPID={employee_no}&faceLibType=blackFD"
        ),
        auth=auth,
        files=files,
        timeout=25,
    )
    result = _isapi_response(response, "Face update")
    result["employee_no"] = employee_no
    return result


def acs_capture_face_sdk_sync(
    ip: str,
    sdk_port: int,
    username: str,
    password: str,
    *,
    timeout: float = 20.0,
    picture_buffer_size: int = 8 * 1024 * 1024,
) -> bytes:
    """Collect a face JPEG from an access terminal's enrollment camera."""
    sdk, user_id = _sdk_login(ip, sdk_port, username, password)
    cond = NET_DVR_CAPTURE_FACE_COND()
    cond.dwSize = ctypes.sizeof(cond)
    handle = sdk.NET_DVR_StartRemoteConfig(
        user_id,
        NET_DVR_CAPTURE_FACE_INFO,
        ctypes.byref(cond),
        ctypes.sizeof(cond),
        None,
        None,
    )
    if handle < 0:
        error_code = int(sdk.NET_DVR_GetLastError())
        sdk.NET_DVR_Logout(user_id)
        raise RuntimeError(f"SDK face collection failed to start: HCNetSDK error={error_code}")

    template1 = ctypes.create_string_buffer(1024 * 1024)
    template2 = ctypes.create_string_buffer(1024 * 1024)
    picture = ctypes.create_string_buffer(picture_buffer_size)
    infrared = ctypes.create_string_buffer(picture_buffer_size)
    deadline = time.monotonic() + max(1.0, float(timeout))

    try:
        while time.monotonic() < deadline:
            capture = NET_DVR_CAPTURE_FACE_CFG()
            capture.dwSize = ctypes.sizeof(capture)
            # These are result lengths, not input buffer capacities. The SDK
            # writes the collected lengths while using the supplied pointers.
            capture.dwFaceTemplate1Size = 0
            capture.pFaceTemplate1Buffer = ctypes.cast(template1, ctypes.c_void_p)
            capture.dwFaceTemplate2Size = 0
            capture.pFaceTemplate2Buffer = ctypes.cast(template2, ctypes.c_void_p)
            capture.dwFacePicSize = 0
            capture.pFacePicBuffer = ctypes.cast(picture, ctypes.c_void_p)
            capture.dwInfraredFacePicSize = 0
            capture.pInfraredFacePicBuffer = ctypes.cast(infrared, ctypes.c_void_p)

            result = sdk.NET_DVR_GetNextRemoteConfig(
                handle, ctypes.byref(capture), ctypes.sizeof(capture),
            )
            if result == NET_SDK_GET_NEXT_STATUS_SUCCESS:
                if 0 < capture.dwFacePicSize <= ctypes.sizeof(picture):
                    image = ctypes.string_at(
                        capture.pFacePicBuffer, int(capture.dwFacePicSize),
                    )
                    jpeg_start = image.find(b"\xff\xd8")
                    jpeg_end = image.rfind(b"\xff\xd9")
                    if jpeg_start >= 0 and jpeg_end > jpeg_start:
                        image = image[jpeg_start:jpeg_end + 2]
                    else:
                        fallback = bytes(picture.raw[: capture.dwFacePicSize])
                        jpeg_start = fallback.find(b"\xff\xd8")
                        jpeg_end = fallback.rfind(b"\xff\xd9")
                        if jpeg_start >= 0 and jpeg_end > jpeg_start:
                            image = fallback[jpeg_start:jpeg_end + 2]
                    decoded = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
                    if decoded is None:
                        raise RuntimeError(
                            "Access terminal returned face data without a valid JPEG image"
                        )
                    encoded_ok, encoded = cv2.imencode(
                        ".jpg", decoded, [cv2.IMWRITE_JPEG_QUALITY, 95],
                    )
                    if not encoded_ok:
                        raise RuntimeError("Unable to normalize the collected face JPEG")
                    image = encoded.tobytes()
                    logger.info(
                        "ACS face collected from %s (progress=%s, quality=%s, bytes=%s)",
                        ip,
                        int(capture.byCaptureProgress),
                        int(capture.byFacePicQuality),
                        len(image),
                    )
                    return image
                time.sleep(0.05)
                continue
            if result == NET_SDK_GET_NEXT_STATUS_NEED_WAIT:
                time.sleep(0.1)
                continue
            if result == NET_SDK_GET_NEXT_STATUS_FINISH:
                raise RuntimeError("Face collection finished without returning an image")
            if result == NET_SDK_GET_NEXT_STATUS_FAILED:
                raise _sdk_error("SDK face collection failed")
            if result == NET_SDK_GET_NEXT_STATUS_EXCEPTION:
                error_code = int(sdk.NET_DVR_GetLastError())
                raise RuntimeError(
                    "Access terminal stopped face collection"
                    f" (HCNetSDK error={error_code}). Keep the enrollment screen active"
                    " and make sure the terminal supports remote face collection."
                )
            raise RuntimeError(f"Unexpected face collection status: {result}")
        raise TimeoutError("Face collection timed out; keep a face in front of the terminal")
    finally:
        sdk.NET_DVR_StopRemoteConfig(handle)
        sdk.NET_DVR_Logout(user_id)


def acs_capture_fingerprint_sdk_sync(
    ip: str,
    sdk_port: int,
    username: str,
    password: str,
    *,
    finger_no: int,
    timeout: float = 25.0,
) -> dict:
    """Collect one fingerprint template from an access terminal reader."""
    finger_no = max(1, min(10, int(finger_no)))
    sdk, user_id = _sdk_login(ip, sdk_port, username, password)
    cond = NET_DVR_CAPTURE_FINGERPRINT_COND()
    cond.dwSize = ctypes.sizeof(cond)
    cond.byFingerNo = finger_no
    handle = sdk.NET_DVR_StartRemoteConfig(
        user_id,
        NET_DVR_CAPTURE_FINGERPRINT_INFO,
        ctypes.byref(cond),
        ctypes.sizeof(cond),
        None,
        None,
    )
    if handle < 0:
        error_code = int(sdk.NET_DVR_GetLastError())
        sdk.NET_DVR_Logout(user_id)
        raise RuntimeError(
            f"SDK fingerprint collection failed to start: HCNetSDK error={error_code}"
        )

    deadline = time.monotonic() + max(1.0, float(timeout))
    try:
        while time.monotonic() < deadline:
            capture = NET_DVR_CAPTURE_FINGERPRINT_CFG()
            capture.dwSize = ctypes.sizeof(capture)
            result = sdk.NET_DVR_GetNextRemoteConfig(
                handle, ctypes.byref(capture), ctypes.sizeof(capture),
            )
            if result == NET_SDK_GET_NEXT_STATUS_SUCCESS:
                size = int(capture.dwFingerPrintDataSize)
                if 0 < size <= MAX_FINGER_PRINT_LEN:
                    return {
                        "ok": True,
                        "finger_no": int(capture.byFingerNo or finger_no),
                        "quality": int(capture.byFingerPrintQuality),
                        "template": bytes(capture.byFingerData[:size]),
                    }
                time.sleep(0.05)
                continue
            if result == NET_SDK_GET_NEXT_STATUS_NEED_WAIT:
                time.sleep(0.1)
                continue
            if result == NET_SDK_GET_NEXT_STATUS_FINISH:
                raise RuntimeError("Fingerprint collection finished without template data")
            if result in (NET_SDK_GET_NEXT_STATUS_FAILED, NET_SDK_GET_NEXT_STATUS_EXCEPTION):
                raise _sdk_error("SDK fingerprint collection failed")
            raise RuntimeError(f"Unexpected fingerprint collection status: {result}")
        raise TimeoutError("Fingerprint collection timed out")
    finally:
        sdk.NET_DVR_StopRemoteConfig(handle)
        sdk.NET_DVR_Logout(user_id)


def acs_person_delete_sdk_sync(
    ip: str,
    sdk_port: int,
    username: str,
    password: str,
    *,
    card_number: str,
) -> dict:
    """Delete a provisioned person/card record through HCNetSDK."""
    sdk, user_id = _sdk_login(ip, sdk_port, username, password)
    cond = NET_DVR_CARD_COND()
    cond.dwSize = ctypes.sizeof(cond)
    cond.dwCardNum = 1
    handle = sdk.NET_DVR_StartRemoteConfig(
        user_id, NET_DVR_DEL_CARD, ctypes.byref(cond), ctypes.sizeof(cond), None, None,
    )
    if handle < 0:
        sdk.NET_DVR_Logout(user_id)
        raise _sdk_error("SDK delete-card remote config failed to start")
    try:
        record = NET_DVR_CARD_SEND_DATA()
        record.dwSize = ctypes.sizeof(record)
        _set_byte_array(record.byCardNo, card_number)
        status = NET_DVR_CARD_STATUS()
        status.dwSize = ctypes.sizeof(status)
        result = _send_remote_record(sdk, handle, record, status)
        result["card_number"] = card_number
        return result
    finally:
        sdk.NET_DVR_StopRemoteConfig(handle)
        sdk.NET_DVR_Logout(user_id)


def acs_person_photo_upload_isapi_sync(
    ip: str,
    http_port: int,
    username: str,
    password: str,
    *,
    employee_no: str,
    photo_bytes: bytes,
) -> dict:
    """Upload a profile picture (display photo) to the person record via ISAPI.

    This is distinct from FDLib face data — it sets the thumbnail shown in the
    device web-UI / HikCentral person list.  Tries the multipart SetUpWithPic
    endpoint first; falls back to the Picture sub-resource on older firmware.
    """
    if not photo_bytes:
        return {"ok": False, "message": "No photo bytes provided"}

    auth = HTTPDigestAuth(username or "admin", password or "")
    base = _isapi_base(ip, http_port)
    user_info_json = json.dumps({"UserInfo": {"employeeNo": str(employee_no)}})

    # Primary: SetUpWithPic (DS-K series, newer firmware)
    try:
        files = {
            "UserInfo": (None, user_info_json, "application/json"),
            "UserPhoto": ("photo.jpg", photo_bytes, "image/jpeg"),
        }
        response = requests.put(
            base + "/ISAPI/AccessControl/UserInfo/SetUpWithPic?format=json",
            auth=auth,
            files=files,
            timeout=20,
        )
        result = _isapi_response(response, "Profile picture upload (SetUpWithPic)")
        if result.get("ok"):
            result["employee_no"] = employee_no
            return result
    except Exception:
        pass

    # Fallback: Picture sub-resource
    try:
        files = {
            "UserInfo": (None, user_info_json, "application/json"),
            "UserPhoto": ("photo.jpg", photo_bytes, "image/jpeg"),
        }
        response = requests.put(
            base + "/ISAPI/AccessControl/UserInfo/Picture?format=json",
            auth=auth,
            files=files,
            timeout=20,
        )
        result = _isapi_response(response, "Profile picture upload (Picture)")
        result["employee_no"] = employee_no
        return result
    except Exception as exc:
        return {"ok": False, "message": f"Profile picture upload failed: {exc}", "employee_no": employee_no}


def acs_person_delete_isapi_sync(
    ip: str,
    http_port: int,
    username: str,
    password: str,
    *,
    employee_no: str,
) -> dict:
    """Delete a person from an ACS device via ISAPI using employeeNo."""
    auth = HTTPDigestAuth(username or "admin", password or "")
    base = _isapi_base(ip, http_port)

    # Delete person record
    response = requests.put(
        base + "/ISAPI/AccessControl/UserInfo/Delete?format=json",
        auth=auth,
        json={"UserInfoDelCond": {"EmployeeNoList": [{"employeeNo": str(employee_no)}]}},
        timeout=15,
    )
    logger.info("ISAPI UserInfo/Delete %s employee=%s → HTTP %s body=%s",
                ip, employee_no, response.status_code, response.text[:300])
    result = _isapi_response(response, "Person delete")
    result["employee_no"] = employee_no
    result["raw_response"] = response.text[:500]

    # Also attempt to delete face data from FDLib regardless of UserInfo result
    try:
        face_resp = requests.put(
            base + "/ISAPI/Intelligent/FDLib/FaceDataRecord/Delete?format=json&FDID=1",
            auth=auth,
            json={"FDID": "1", "faceLibType": "blackFD", "EmployeeNoList": [{"employeeNo": str(employee_no)}]},
            timeout=10,
        )
        logger.info("ISAPI FDLib/Delete %s employee=%s → HTTP %s body=%s",
                    ip, employee_no, face_resp.status_code, face_resp.text[:300])
        result["face_delete"] = _isapi_response(face_resp, "Face delete")
    except Exception as exc:
        result["face_delete"] = {"ok": False, "message": str(exc)}

    # Also attempt card deletion
    try:
        card_resp = requests.put(
            base + "/ISAPI/AccessControl/CardInfo/Delete?format=json",
            auth=auth,
            json={"CardInfoDelCond": {"EmployeeNoList": [{"employeeNo": str(employee_no)}]}},
            timeout=10,
        )
        logger.info("ISAPI CardInfo/Delete %s employee=%s → HTTP %s body=%s",
                    ip, employee_no, card_resp.status_code, card_resp.text[:300])
        result["card_delete"] = _isapi_response(card_resp, "Card delete")
    except Exception as exc:
        result["card_delete"] = {"ok": False, "message": str(exc)}

    return result


def _sdk_stream_type(channel: int) -> int:
    if channel >= 100:
        stream_digit = channel % 100
        if stream_digit == 2:
            return 1
        if stream_digit == 3:
            return 2
    return 0


def _play_error(play, port: int, prefix: str) -> RuntimeError:
    if hasattr(play, "PlayM4_GetLastError"):
        return RuntimeError(f"{prefix}: PlayCtrl error={play.PlayM4_GetLastError(port)}")
    return RuntimeError(prefix)


def hiksdk_snapshot_sync(
    ip: str,
    sdk_port: int,
    channel: int,
    username: str,
    password: str,
    *,
    pic_size: int = 0xFF,
    quality: int = 0,
    buffer_size: int = 8 * 1024 * 1024,
) -> bytes:
    """Capture one JPEG image via Hikvision private SDK protocol."""
    sdk = _load_sdk()
    info = NET_DVR_DEVICEINFO_V30()

    user_id = sdk.NET_DVR_Login_V30(
        ip.encode("utf-8"),
        int(sdk_port or 8000),
        (username or "").encode("utf-8"),
        (password or "").encode("utf-8"),
        ctypes.byref(info),
    )
    if user_id < 0:
        raise _sdk_error("SDK login failed")

    try:
        jpeg_para = NET_DVR_JPEGPARA(wPicSize=int(pic_size), wPicQuality=int(quality))
        out_size = DWORD(0)
        buf = ctypes.create_string_buffer(buffer_size)
        ok = sdk.NET_DVR_CaptureJPEGPicture_NEW(
            user_id,
            _sdk_channel(int(channel or 1)),
            ctypes.byref(jpeg_para),
            buf,
            buffer_size,
            ctypes.byref(out_size),
        )
        if not ok:
            raise _sdk_error("SDK JPEG capture failed")
        if out_size.value <= 0:
            raise RuntimeError("SDK JPEG capture returned an empty image")
        return bytes(buf.raw[: out_size.value])
    finally:
        sdk.NET_DVR_Logout(user_id)


async def hiksdk_mjpeg_generator(
    ip: str,
    sdk_port: int,
    channel: int,
    username: str,
    password: str,
    *,
    fps: float = 2.0,
) -> AsyncGenerator[bytes, None]:
    """MJPEG stream generated from repeated SDK snapshots."""
    loop = asyncio.get_running_loop()
    delay = 1.0 / max(0.5, min(float(fps or 2.0), 10.0))
    next_frame_at = loop.time()

    while True:
        started_at = loop.time()
        try:
            jpeg = await loop.run_in_executor(
                None,
                hiksdk_snapshot_sync,
                ip,
                sdk_port,
                channel,
                username,
                password,
            )
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
        except Exception as e:
            logger.warning("HCNetSDK MJPEG snapshot failed for %s:%s: %s", ip, sdk_port, e)
            return
        next_frame_at = max(next_frame_at + delay, started_at + delay)
        remaining = next_frame_at - loop.time()
        if remaining > 0:
            await asyncio.sleep(remaining)


class HikSdkRecordingSession:
    """A real-time archive writer backed directly by HCNetSDK.

    The device connection and preview are opened through ``NET_DVR_RealPlay_V40``
    and HCNetSDK writes the received stream to a local file with
    ``NET_DVR_SaveRealData``.  This deliberately does not use RTSP.
    """

    def __init__(self, ip: str, sdk_port: int, channel: int, username: str, password: str) -> None:
        self.ip = ip
        self.sdk_port = int(sdk_port or 8000)
        self.channel = int(channel or 101)
        self.username = username or ""
        self.password = password or ""
        self.sdk = _load_sdk()
        self.user_id = -1
        self.real_handle = -1
        self.save_path: Path | None = None
        self._saving = False
        self._stream_ready = threading.Event()
        # Keep the callback alive for the complete SDK preview lifetime.  The
        # SDK owns the write pipeline; the callback only keeps RealPlay active.
        self._real_cb = REALDATACALLBACK(self._on_real_data)

    def _on_real_data(self, _handle, data_type, _buffer, _size, _user) -> None:
        if data_type == NET_DVR_SYSHEAD:
            self._stream_ready.set()

    def start(self, destination: str | Path) -> Path:
        target = Path(destination).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)

        info = NET_DVR_DEVICEINFO_V30()
        self.user_id = self.sdk.NET_DVR_Login_V30(
            self.ip.encode("utf-8"),
            self.sdk_port,
            self.username.encode("utf-8"),
            self.password.encode("utf-8"),
            ctypes.byref(info),
        )
        if self.user_id < 0:
            raise _sdk_error("SDK login for archive recording failed")

        preview = NET_DVR_PREVIEWINFO()
        preview.lChannel = _sdk_channel(self.channel)
        preview.dwStreamType = _sdk_stream_type(self.channel)
        # Recording uses the SDK's reliable TCP transport by default.  The
        # ordinary low-latency preview may use UDP, but recording needs the
        # complete stream header and every packet.
        preview.dwLinkMode = int(os.environ.get("HIKSDK_RECORDING_LINK_MODE", "0"))
        preview.hPlayWnd = None
        preview.bBlocked = 1
        # Keep the normal RealPlay data path.  On some camera firmware the
        # passback-record mode suppresses the RealPlay system header and makes
        # NET_DVR_SaveRealData unusable.
        preview.bPassbackRecord = 0
        preview.dwDisplayBufNum = 1
        preview.byProtoType = 0

        self.real_handle = self.sdk.NET_DVR_RealPlay_V40(
            self.user_id,
            ctypes.byref(preview),
            self._real_cb,
            None,
        )
        if self.real_handle < 0:
            self.stop()
            raise _sdk_error("SDK RealPlay for archive recording failed")

        # A save request made before the SDK has delivered the stream header can
        # fail silently on some Hikvision devices.  Wait for the RealPlay
        # callback first, then fall back to the SDK V30 variant when available.
        # The callback is a readiness hint.  Do not reject a valid HCNetSDK
        # preview solely because firmware does not pass the header back to the
        # callback; the SDK can still attach its native recorder to the handle.
        self._stream_ready.wait(timeout=5)

        raw_target = os.fsencode(str(target))
        started = bool(self.sdk.NET_DVR_SaveRealData(self.real_handle, raw_target))
        error_code = int(self.sdk.NET_DVR_GetLastError())
        if not started:
            started = bool(self.sdk.NET_DVR_SaveRealData_V30(self.real_handle, DWORD(0), raw_target))
            error_code = int(self.sdk.NET_DVR_GetLastError())
        if not started:
            self.stop()
            raise RuntimeError(f"SDK archive recording could not be started: HCNetSDK error={error_code}")

        self.save_path = target
        self._saving = True
        return target

    def stop(self) -> Path | None:
        if self._saving and self.real_handle >= 0:
            try:
                self.sdk.NET_DVR_StopSaveRealData(self.real_handle)
            except Exception:
                logger.exception("Unable to stop HCNetSDK archive recording")
            self._saving = False

        if self.real_handle >= 0:
            try:
                self.sdk.NET_DVR_StopRealPlay(self.real_handle)
            except Exception:
                pass
            self.real_handle = -1

        if self.user_id >= 0:
            try:
                self.sdk.NET_DVR_Logout(self.user_id)
            except Exception:
                pass
            self.user_id = -1

        return self.save_path


def hiksdk_recording_start_sync(
    ip: str,
    sdk_port: int,
    channel: int,
    username: str,
    password: str,
    destination: str | Path,
) -> HikSdkRecordingSession:
    """Start SDK-native recording and return the live recorder session."""
    recorder = HikSdkRecordingSession(ip, sdk_port, channel, username, password)
    recorder.start(destination)
    return recorder


class HikSdkH264Session:
    """HCNetSDK RealPlay session decoded through PlayCtrl into JPEG frames."""

    def __init__(self, ip: str, sdk_port: int, channel: int, username: str, password: str) -> None:
        self.ip = ip
        self.sdk_port = int(sdk_port or 8000)
        self.channel = int(channel or 101)
        self.username = username or ""
        self.password = password or ""

        self.sdk = _load_sdk()
        self.play = _load_playctrl()
        self.user_id = -1
        self.real_handle = -1
        self.play_port = -1

        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
        self._latest_jpeg: bytes | None = None
        self._latest_yuv:  bytes | None = None   # raw YUV420p for WebRTC (no JPEG roundtrip)
        self._latest_width  = 0
        self._latest_height = 0
        self._latest_stamp = 0
        self._started = False
        self._stream_opened = False

        self._real_cb = REALDATACALLBACK(self._on_real_data)
        self._dec_cb = DECCALLBACK(self._on_decoded_frame)

    def start(self) -> None:
        info = NET_DVR_DEVICEINFO_V30()
        self.user_id = self.sdk.NET_DVR_Login_V30(
            self.ip.encode("utf-8"),
            self.sdk_port,
            self.username.encode("utf-8"),
            self.password.encode("utf-8"),
            ctypes.byref(info),
        )
        if self.user_id < 0:
            raise _sdk_error("SDK login failed")

        preview = NET_DVR_PREVIEWINFO()
        preview.lChannel      = _sdk_channel(self.channel)
        preview.dwStreamType  = _sdk_stream_type(self.channel)
        # UDP (1) = lower latency on LAN; falls back to TCP (0) if camera blocks UDP
        link_mode = int(os.environ.get("HIKSDK_LINK_MODE", "1"))
        preview.dwLinkMode    = link_mode
        preview.hPlayWnd      = None
        preview.bBlocked      = 1
        preview.dwDisplayBufNum = 1  # minimum buffer = minimum latency
        preview.byProtoType   = 0

        self.real_handle = self.sdk.NET_DVR_RealPlay_V40(
            self.user_id,
            ctypes.byref(preview),
            self._real_cb,
            None,
        )
        if self.real_handle < 0:
            self.stop()
            raise _sdk_error("SDK RealPlay failed")

        self._started = True

    def stop(self) -> None:
        with self._lock:
            self._started = False
            self._condition.notify_all()

        if self.real_handle >= 0:
            try:
                self.sdk.NET_DVR_StopRealPlay(self.real_handle)
            except Exception:
                pass
            self.real_handle = -1

        if self.play_port >= 0:
            try:
                self.play.PlayM4_Stop(self.play_port)
                self.play.PlayM4_CloseStream(self.play_port)
                self.play.PlayM4_FreePort(self.play_port)
            except Exception:
                pass
            self.play_port = -1
            self._stream_opened = False

        if self.user_id >= 0:
            try:
                self.sdk.NET_DVR_Logout(self.user_id)
            except Exception:
                pass
            self.user_id = -1

    def wait_for_yuv(self, last_stamp: int, timeout: float = 5.0):
        """Return (yuv420p_bytes, width, height, stamp) — zero-copy path for WebRTC."""
        with self._condition:
            self._condition.wait_for(
                lambda: not self._started or self._latest_stamp != last_stamp,
                timeout=timeout,
            )
            return (
                self._latest_yuv,
                self._latest_width,
                self._latest_height,
                self._latest_stamp,
            )

    def wait_for_jpeg(self, last_stamp: int, timeout: float = 5.0) -> tuple[bytes | None, int]:
        with self._condition:
            self._condition.wait_for(
                lambda: not self._started or self._latest_stamp != last_stamp,
                timeout=timeout,
            )
            return self._latest_jpeg, self._latest_stamp

    def _on_real_data(self, _handle, data_type, p_buffer, buf_size, _user) -> None:
        try:
            if data_type == NET_DVR_SYSHEAD:
                if self._stream_opened:
                    return
                port = LONG(-1)
                if not self.play.PlayM4_GetPort(ctypes.byref(port)):
                    logger.warning("PlayCtrl GetPort failed")
                    return
                self.play_port = int(port.value)
                if not self.play.PlayM4_OpenStream(self.play_port, p_buffer, buf_size, 1 * 1024 * 1024):
                    logger.warning("%s", _play_error(self.play, self.play_port, "PlayCtrl OpenStream failed"))
                    return
                if not self.play.PlayM4_SetDecCallBack(self.play_port, self._dec_cb):
                    logger.warning("%s", _play_error(self.play, self.play_port, "PlayCtrl SetDecCallBack failed"))
                    return
                if not self.play.PlayM4_Play(self.play_port, None):
                    logger.warning("%s", _play_error(self.play, self.play_port, "PlayCtrl Play failed"))
                    return
                self._stream_opened = True
                return

            if data_type == NET_DVR_STREAMDATA and self._stream_opened and self.play_port >= 0:
                self.play.PlayM4_InputData(self.play_port, p_buffer, buf_size)
        except Exception as e:
            logger.warning("HCNetSDK RealPlay callback failed: %s", e)

    # Tunable per-session settings
    jpeg_quality: int = 80   # 70-85 sweet spot; lower = faster delivery
    max_fps: float   = 0.0   # 0 = unlimited; set to e.g. 15.0 to cap frame rate
    _last_frame_ts: float = 0.0

    def _on_decoded_frame(self, _port, p_buf, size, p_frame_info, _reserved1, _reserved2) -> None:
        try:
            frame_info = p_frame_info.contents
            if frame_info.nType != T_YV12 or frame_info.nWidth <= 0 or frame_info.nHeight <= 0:
                return

            # Frame rate limiter — drop frames to stay within max_fps
            if self.max_fps > 0:
                import time as _time
                now = _time.monotonic()
                if now - self._last_frame_ts < 1.0 / self.max_fps:
                    return
                self._last_frame_ts = now

            width = int(frame_info.nWidth)
            height = int(frame_info.nHeight)
            expected = width * height * 3 // 2
            if size < expected:
                return

            raw = ctypes.string_at(p_buf, expected)

            # YV12→YUV420p plane swap (V↔U): store for WebRTC zero-copy path
            y_size  = width * height
            uv_size = y_size // 4
            y_plane = raw[:y_size]
            v_plane = raw[y_size          : y_size + uv_size]    # YV12: V first
            u_plane = raw[y_size + uv_size: y_size + 2 * uv_size]
            yuv420p = y_plane + u_plane + v_plane                # YUV420p: U first

            # JPEG encode only for MJPEG stream consumers
            yv12 = np.frombuffer(raw, dtype=np.uint8).reshape((height * 3 // 2, width))
            bgr = cv2.cvtColor(yv12, cv2.COLOR_YUV2BGR_YV12)
            ok, encoded = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality])
            if not ok:
                return

            with self._condition:
                self._latest_jpeg  = encoded.tobytes()
                self._latest_yuv   = yuv420p
                self._latest_width  = width
                self._latest_height = height
                self._latest_stamp += 1
                self._condition.notify_all()
        except Exception as e:
            logger.warning("PlayCtrl decode callback failed: %s", e)


# ── Session pool — reuse open SDK connections across requests ─────────────────
import time as _time

_session_pool: dict[tuple, "HikSdkH264Session"] = {}
_session_pool_lock = threading.Lock()
_SESSION_TTL = 30.0  # seconds idle before eviction


def _pool_key(ip, port, channel, username):
    return (ip, int(port or 8000), int(channel or 101), username)


def _get_or_create_session(ip, port, channel, username, password, jpeg_quality=80, max_fps=0.0):
    key = _pool_key(ip, port, channel, username)
    with _session_pool_lock:
        existing = _session_pool.get(key)
        if existing and existing._started:
            existing._pool_last_used = _time.monotonic()
            return existing, False  # (session, is_new)
        # Create fresh session
        session = HikSdkH264Session(ip, port, channel, username, password)
        session.jpeg_quality = jpeg_quality
        session.max_fps      = max_fps
        session._pool_last_used = _time.monotonic()
        _session_pool[key] = session
        return session, True


def _release_session(key):
    """Mark session as idle; it stays in the pool for TTL seconds."""
    with _session_pool_lock:
        session = _session_pool.get(key)
        if session:
            session._pool_last_used = _time.monotonic()


async def hiksdk_h264_mjpeg_generator(
    ip: str,
    sdk_port: int,
    channel: int,
    username: str,
    password: str,
    *,
    jpeg_quality: int = 80,
    max_fps: float = 0.0,
) -> AsyncGenerator[bytes, None]:
    """MJPEG stream from HCNetSDK H264 RealPlay decoded by PlayCtrl.

    Uses a session pool so the second viewer on the same camera reconnects
    instantly without re-logging into the SDK.
    """
    # Stream type 1 (sub) → lower quality + fps cap for bandwidth saving
    if _sdk_stream_type(int(channel or 101)) == 1:
        jpeg_quality = min(jpeg_quality, 72)
        if max_fps == 0.0:
            max_fps = 12.0

    key = _pool_key(ip, sdk_port, channel, username)
    session, is_new = _get_or_create_session(ip, sdk_port, channel, username, password, jpeg_quality, max_fps)
    loop = asyncio.get_running_loop()
    last_stamp = 0
    frames_sent = 0
    fallback_to_snapshots = False

    try:
        if is_new:
            await loop.run_in_executor(None, session.start)

        while True:
            jpeg, stamp = await loop.run_in_executor(None, session.wait_for_jpeg, last_stamp, 8.0)
            if not jpeg or stamp == last_stamp:
                fallback_to_snapshots = frames_sent == 0
                break
            last_stamp = stamp
            frames_sent += 1
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
    except Exception as e:
        logger.warning("HCNetSDK H264 MJPEG generator failed for %s:%s: %s", ip, sdk_port, e)
        fallback_to_snapshots = frames_sent == 0
    finally:
        _release_session(key)

    if fallback_to_snapshots:
        logger.warning(
            "HCNetSDK RealPlay produced no frames for %s:%s channel=%s; falling back to SDK snapshots",
            ip,
            sdk_port,
            channel,
        )
        snapshot_fps = max(1.0, min(float(max_fps or 4.0), 4.0))
        async for chunk in hiksdk_mjpeg_generator(
            ip,
            sdk_port,
            channel,
            username,
            password,
            fps=snapshot_fps,
        ):
            yield chunk


def hiksdk_diagnostics_sync(ip: str, sdk_port: int, channel: int, username: str, password: str) -> dict:
    jpeg = hiksdk_snapshot_sync(ip, sdk_port, channel, username, password)
    return {
        "ok": True,
        "snapshot_size": len(jpeg),
        "sdk_port": int(sdk_port or 8000),
        "sdk_channel": _sdk_channel(int(channel or 1)),
    }


# ---------------------------------------------------------------------------
# Access Control (ACS) — ISAPI HTTP door control (recommended, works on all models)
# ---------------------------------------------------------------------------

import base64
from urllib.request import urlopen, Request as _UrlRequest
from urllib.error import URLError as _URLError

# ISAPI command map: our command name → Hikvision XML cmd value
_ISAPI_CMD_MAP = {
    "unlock":     "open",
    "lock":       "close",
    "stay_open":  "alwaysOpen",
    "stay_close": "alwaysClose",
}


def acs_door_control_isapi_sync(
    ip: str,
    http_port: int,
    username: str,
    password: str,
    door_no: int,
    command: str,
) -> dict:
    """
    Control a door via Hikvision ISAPI (HTTP PUT).
    Works on all Hikvision ACS models (DS-K series, DS-3E series, etc.)
    command: 'unlock' | 'lock' | 'stay_open' | 'stay_close'
    """
    isapi_cmd = _ISAPI_CMD_MAP.get(command, "open")
    url = f"http://{ip}:{int(http_port or 80)}/ISAPI/AccessControl/RemoteControl/door/{door_no}"
    xml_body = f"<RemoteControlDoor><cmd>{isapi_cmd}</cmd></RemoteControlDoor>".encode("utf-8")

    credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
    req = _UrlRequest(
        url,
        data=xml_body,
        headers={
            "Content-Type": "application/xml",
            "Authorization": f"Basic {credentials}",
        },
        method="PUT",
    )
    try:
        with urlopen(req, timeout=6) as resp:
            ok = resp.status < 400
            return {"ok": ok, "error_code": resp.status,
                    "message": "ok" if ok else f"ISAPI HTTP {resp.status}"}
    except _URLError as e:
        return {"ok": False, "error_code": None, "message": f"ISAPI connection error: {e.reason}"}
    except Exception as e:
        return {"ok": False, "error_code": None, "message": f"ISAPI error: {e}"}


# ---------------------------------------------------------------------------
# Access Control (ACS) — SDK door control + status
# ---------------------------------------------------------------------------

# NET_DVR_ControlGateway dwStaic values (from ClientDemo/DlgGatewayCfg.cpp)
ACS_DOOR_CMD_CLOSE      = 0    # close / lock
ACS_DOOR_CMD_OPEN       = 1    # unlock (momentary open)
ACS_DOOR_CMD_STAY_OPEN  = 2    # always open
ACS_DOOR_CMD_STAY_CLOSE = 3    # always closed

# NET_DVR_GET_ACS_WORK_STATUS_V50
NET_DVR_GET_ACS_WORK_STATUS_V50 = 2180


class NET_DVR_ACS_WORK_STATUS_V50(ctypes.Structure):
    """Simplified ACS work status — only fields we actually read."""
    _pack_ = 1
    _fields_ = [
        ("dwSize",             DWORD),
        ("byDoorLockStatus",   BYTE * 8),   # 1=open, 0=closed per door
        ("byDoorStatus",       BYTE * 8),   # door sensor: 1=open, 0=closed
        ("byAlarmInStatus",    BYTE * 8),
        ("byAlarmOutStatus",   BYTE * 4),
        ("byCardReaderOnline", BYTE * 8),   # 1=online
        ("byRes",              BYTE * 64),
    ]


def _acs_load_control_gateway(sdk) -> None:
    """Register NET_DVR_ControlGateway argtypes once."""
    if not hasattr(sdk, "_acs_ctrl_gw_registered"):
        sdk.NET_DVR_ControlGateway.argtypes = [LONG, LONG, DWORD]
        sdk.NET_DVR_ControlGateway.restype = BOOL
        sdk._acs_ctrl_gw_registered = True


def acs_door_control_sync(
    ip: str,
    sdk_port: int,
    username: str,
    password: str,
    door_no: int,
    command: int,
) -> dict:
    """
    Control a door via HCNetSDK NET_DVR_ControlGateway.
    command: ACS_DOOR_CMD_OPEN / CLOSE / STAY_OPEN / STAY_CLOSE
    door_no: 1-based door index (pass -1 to control all doors)
    """
    sdk = _load_sdk()
    _acs_load_control_gateway(sdk)

    info = NET_DVR_DEVICEINFO_V30()
    user_id = sdk.NET_DVR_Login_V30(
        ip.encode("utf-8"),
        int(sdk_port or 8000),
        (username or "admin").encode("utf-8"),
        (password or "").encode("utf-8"),
        ctypes.byref(info),
    )
    if user_id < 0:
        err = sdk.NET_DVR_GetLastError()
        return {"ok": False, "error_code": int(err), "message": f"Login failed: error={err}"}

    try:
        ok = sdk.NET_DVR_ControlGateway(user_id, LONG(door_no), DWORD(command))
        if not ok:
            err = sdk.NET_DVR_GetLastError()
            return {"ok": False, "error_code": int(err),
                    "message": f"NET_DVR_ControlGateway failed: error={err}"}
        return {"ok": True, "error_code": None, "message": "ok"}
    finally:
        sdk.NET_DVR_Logout(user_id)


def acs_get_status_sync(ip: str, sdk_port: int, username: str, password: str) -> dict:
    """
    Fetch ACS device status: door lock states, sensor states, card reader online.
    Returns a dict with per-door arrays (up to 8 doors).
    """
    sdk = _load_sdk()

    if not hasattr(sdk, "_acs_get_dvr_config_registered"):
        sdk.NET_DVR_GetDVRConfig.argtypes = [
            LONG, DWORD, LONG,
            ctypes.c_void_p, DWORD,
            ctypes.POINTER(DWORD),
        ]
        sdk.NET_DVR_GetDVRConfig.restype = BOOL
        sdk._acs_get_dvr_config_registered = True

    info = NET_DVR_DEVICEINFO_V30()
    user_id = sdk.NET_DVR_Login_V30(
        ip.encode("utf-8"),
        int(sdk_port or 8000),
        (username or "admin").encode("utf-8"),
        (password or "").encode("utf-8"),
        ctypes.byref(info),
    )
    if user_id < 0:
        err = sdk.NET_DVR_GetLastError()
        return {"online": False, "error_code": int(err), "message": f"Login failed: error={err}"}

    try:
        status = NET_DVR_ACS_WORK_STATUS_V50()
        status.dwSize = ctypes.sizeof(NET_DVR_ACS_WORK_STATUS_V50)
        out_len = DWORD(0)

        ok = sdk.NET_DVR_GetDVRConfig(
            user_id,
            NET_DVR_GET_ACS_WORK_STATUS_V50,
            0,
            ctypes.byref(status),
            ctypes.sizeof(NET_DVR_ACS_WORK_STATUS_V50),
            ctypes.byref(out_len),
        )

        if not ok:
            err = sdk.NET_DVR_GetLastError()
            return {"online": True, "status_available": False,
                    "error_code": int(err), "message": f"GetDVRConfig failed: error={err}"}

        return {
            "online": True,
            "status_available": True,
            "error_code": None,
            "message": "ok",
            "door_lock_status":    list(status.byDoorLockStatus),
            "door_sensor_status":  list(status.byDoorStatus),
            "alarm_input_status":  list(status.byAlarmInStatus),
            "card_reader_online":  list(status.byCardReaderOnline),
        }
    finally:
        sdk.NET_DVR_Logout(user_id)
