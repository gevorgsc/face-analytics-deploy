"""
onvif_client.py - Minimal ONVIF snapshot client (no external ONVIF library needed).

Uses direct SOAP over HTTP with Digest Auth, which works for the majority of
ONVIF-compliant cameras (Hikvision, Dahua, Axis, etc.).

For cameras that require WS-Security (nonce/timestamp) auth instead of HTTP Digest,
install `onvif-zeep` and use ONVIFCamera() instead.
"""
import logging
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ONVIF media service paths to try in order
_MEDIA_PATHS = [
    "/onvif/Media",
    "/onvif/media",
    "/onvif/Media2",
    "/onvif/device_service",
]

_GET_PROFILES = """\
<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
    xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <s:Body><trt:GetProfiles/></s:Body>
</s:Envelope>"""

_GET_SNAPSHOT_URI = """\
<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
    xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <s:Body>
    <trt:GetSnapshotUri>
      <trt:ProfileToken>{token}</trt:ProfileToken>
    </trt:GetSnapshotUri>
  </s:Body>
</s:Envelope>"""

_SOAP_HEADERS = {
    "Content-Type": "application/soap+xml; charset=utf-8",
}


def _find_profile_token(xml: str) -> Optional[str]:
    m = re.search(r'\btoken=["\']([^"\']+)["\']', xml)
    return m.group(1) if m else None


def _find_snapshot_uri(xml: str) -> Optional[str]:
    # Try various namespace prefixes
    for pattern in (r'<tt:Uri>(.*?)</tt:Uri>', r'<Uri>(.*?)</Uri>'):
        m = re.search(pattern, xml)
        if m:
            return m.group(1).strip()
    return None


def get_onvif_snapshot_uri_sync(ip: str, http_port: int,
                                username: str, password: str) -> Optional[str]:
    """
    Returns the ONVIF snapshot URI for the first media profile, or None.
    Blocking - run in thread pool from async context.
    """
    auth = httpx.DigestAuth(username, password)
    base = f"http://{ip}:{http_port}"
    media_url: Optional[str] = None

    with httpx.Client(timeout=6) as client:
        # Find the media service endpoint
        for path in _MEDIA_PATHS:
            try:
                r = client.post(
                    base + path,
                    content=_GET_PROFILES.encode(),
                    headers=_SOAP_HEADERS,
                    auth=auth,
                )
                if r.status_code < 400:
                    media_url = base + path
                    profiles_xml = r.text
                    break
            except Exception:
                continue

        if not media_url:
            logger.warning("ONVIF: no media service found at %s:%d", ip, http_port)
            return None

        token = _find_profile_token(profiles_xml)
        if not token:
            logger.warning("ONVIF: no profile token found in GetProfiles response")
            return None

        # Get snapshot URI for the first profile
        try:
            r2 = client.post(
                media_url,
                content=_GET_SNAPSHOT_URI.format(token=token).encode(),
                headers=_SOAP_HEADERS,
                auth=auth,
            )
            uri = _find_snapshot_uri(r2.text)
            if uri:
                logger.info("ONVIF snapshot URI for %s: %s", ip, uri)
                return uri
            logger.warning("ONVIF: snapshot URI not found in response: %s", r2.text[:300])
        except Exception as e:
            logger.warning("ONVIF GetSnapshotUri failed: %s", e)

    return None


def onvif_snapshot_sync(ip: str, http_port: int,
                        username: str, password: str) -> bytes:
    """
    Fetches a JPEG snapshot via ONVIF.
    Blocking - run in thread pool from async context.
    """
    uri = get_onvif_snapshot_uri_sync(ip, http_port, username, password)
    if not uri:
        raise RuntimeError(f"Cannot get ONVIF snapshot URI from {ip}:{http_port}")

    with httpx.Client(timeout=8) as client:
        resp = client.get(uri, auth=httpx.DigestAuth(username, password))
        resp.raise_for_status()
        return resp.content
