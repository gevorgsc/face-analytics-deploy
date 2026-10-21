"""
isapi_client.py - Hikvision ISAPI HTTP client.

Provides snapshot and MJPEG-stream access without RTSP.
All modern Hikvision cameras support ISAPI on port 80 (HTTP) or 443 (HTTPS).

Snapshot URL: http://{ip}:{http_port}/ISAPI/Streaming/channels/{ch}/picture
MJPEG URL:    http://{ip}:{http_port}/ISAPI/Streaming/channels/{ch}/httpPreview
"""
import asyncio
import logging
from typing import AsyncGenerator

import httpx

logger = logging.getLogger(__name__)

_SNAPSHOT_PATH = "/ISAPI/Streaming/channels/{ch}/picture"
_MJPEG_PATH    = "/ISAPI/Streaming/channels/{ch}/httpPreview"


def _snapshot_url(ip: str, http_port: int, channel: int) -> str:
    return f"http://{ip}:{http_port}" + _SNAPSHOT_PATH.format(ch=channel)


def _stream_url(ip: str, http_port: int, channel: int) -> str:
    return f"http://{ip}:{http_port}" + _MJPEG_PATH.format(ch=channel)


def isapi_snapshot_sync(ip: str, http_port: int, channel: int,
                        username: str, password: str) -> bytes:
    """Blocking call - run in thread pool executor from async context."""
    url = _snapshot_url(ip, http_port, channel)
    with httpx.Client(timeout=8) as client:
        resp = client.get(url, auth=httpx.DigestAuth(username, password))
        resp.raise_for_status()
        ct = resp.headers.get("content-type", "")
        if "image" not in ct and len(resp.content) < 100:
            raise RuntimeError(f"ISAPI snapshot: unexpected content-type '{ct}'")
        return resp.content


async def isapi_mjpeg_generator(ip: str, http_port: int, channel: int,
                                username: str, password: str) -> AsyncGenerator[bytes, None]:
    """
    Async generator that proxies the camera's MJPEG stream.
    The camera sends multipart/x-mixed-replace - we forward the raw bytes,
    so the browser (via our StreamingResponse) sees native MJPEG.
    """
    url = _stream_url(ip, http_port, channel)
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, read=None),
        ) as client:
            async with client.stream(
                "GET", url,
                auth=httpx.DigestAuth(username, password),
            ) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=8192):
                    yield chunk
    except Exception as e:
        logger.warning("ISAPI MJPEG stream error %s: %s", url, e)
