"""Small HikCentral/OpenAPI client with Artemis and Basic auth support."""

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from urllib.parse import urlparse

import httpx


class HikCentralError(RuntimeError):
    pass


class HikCentralClient:
    def __init__(self):
        self.base_url = os.getenv("HIKCENTRAL_URL", "").rstrip("/")
        self.auth_mode = os.getenv("HIKCENTRAL_AUTH_MODE", "artemis").strip().lower()
        self.app_key = os.getenv("HIKCENTRAL_APP_KEY", "")
        self.app_secret = os.getenv("HIKCENTRAL_APP_SECRET", "")
        self.username = os.getenv("HIKCENTRAL_USERNAME", "")
        self.password = os.getenv("HIKCENTRAL_PASSWORD", "")
        self.verify_tls = os.getenv("HIKCENTRAL_VERIFY_TLS", "1") == "1"
        self.timeout = float(os.getenv("HIKCENTRAL_TIMEOUT_SECONDS", "15"))

    @property
    def configured(self) -> bool:
        if not self.base_url:
            return False
        if self.auth_mode == "basic":
            return bool(self.username and self.password)
        return bool(self.app_key and self.app_secret)

    def _artemis_headers(self, method: str, path: str, body: bytes) -> dict:
        timestamp = str(int(time.time() * 1000))
        nonce = uuid.uuid4().hex
        content_md5 = base64.b64encode(hashlib.md5(body).digest()).decode() if body else ""
        signed_headers = "x-ca-key,x-ca-nonce,x-ca-timestamp"
        canonical = (
            f"{method.upper()}\n"
            "application/json\n"
            f"{content_md5}\n"
            "application/json\n"
            f"x-ca-key:{self.app_key}\n"
            f"x-ca-nonce:{nonce}\n"
            f"x-ca-timestamp:{timestamp}\n"
            f"{path}"
        )
        signature = base64.b64encode(
            hmac.new(self.app_secret.encode(), canonical.encode(), hashlib.sha256).digest()
        ).decode()
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Ca-Key": self.app_key,
            "X-Ca-Nonce": nonce,
            "X-Ca-Timestamp": timestamp,
            "X-Ca-Signature-Headers": signed_headers,
            "X-Ca-Signature": signature,
        }

    def request(self, method: str, path: str, payload: dict | None = None) -> dict:
        if not self.configured:
            raise HikCentralError("HikCentral connector is not configured")
        if not path.startswith("/"):
            path = "/" + path
        body = json.dumps(payload or {}, separators=(",", ":"), ensure_ascii=True).encode()
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        auth = None
        if self.auth_mode == "basic":
            auth = httpx.BasicAuth(self.username, self.password)
        else:
            headers = self._artemis_headers(method, path, body)
        try:
            with httpx.Client(verify=self.verify_tls, timeout=self.timeout, auth=auth) as client:
                response = client.request(method, self.base_url + path, content=body, headers=headers)
        except httpx.HTTPError as exc:
            raise HikCentralError(f"HikCentral connection failed: {exc}") from exc
        if response.status_code >= 400:
            raise HikCentralError(f"HikCentral returned HTTP {response.status_code}")
        try:
            data = response.json()
        except ValueError as exc:
            raise HikCentralError("HikCentral returned a non-JSON response") from exc
        code = str(data.get("code", "0"))
        if code not in {"0", "200", "success"}:
            raise HikCentralError(data.get("msg") or data.get("message") or f"HikCentral code {code}")
        return data

    def test(self) -> dict:
        path = os.getenv("HIKCENTRAL_TEST_PATH", "/artemis/api/resource/v1/regions")
        return self.request("POST", path, {"pageNo": 1, "pageSize": 1})

    def people_page(self, page_no: int, page_size: int = 200) -> dict:
        path = os.getenv(
            "HIKCENTRAL_PERSON_LIST_PATH",
            "/artemis/api/resource/v1/person/personList",
        )
        return self.request("POST", path, {"pageNo": page_no, "pageSize": page_size})


def extract_rows(response: dict) -> tuple[list[dict], int]:
    data = response.get("data") or {}
    rows = (
        data.get("list")
        or data.get("rows")
        or data.get("items")
        or response.get("list")
        or []
    )
    total = int(data.get("total") or data.get("totalCount") or len(rows))
    return rows, total


def connection_summary() -> dict:
    client = HikCentralClient()
    host = urlparse(client.base_url).hostname if client.base_url else None
    return {
        "configured": client.configured,
        "host": host,
        "auth_mode": client.auth_mode,
        "verify_tls": client.verify_tls,
    }
