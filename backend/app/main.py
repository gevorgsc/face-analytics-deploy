"""Face Analytics Pro - FastAPI application entry point.

Responsible only for:
  - App creation + middleware
  - Router registration (core + enterprise)
  - Startup lifespan (DB init, FAISS, schedulers)
  - Health / readiness / WebSocket endpoints
"""

import asyncio
import base64
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import socket
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.auth import authenticate_token, get_current_user, hash_password
from app.config import assert_config_is_startable, validate_app_config
from app.db import get_db
from app.faiss_engine import FAISS_AVAILABLE, rebuild_faiss_indexes
from app.licensing import (
    MODULE_ACS,
    MODULE_ANY,
    MODULE_FACE,
    license_status,
    module_is_licensed,
    required_module_for_path,
)
from app.logging_utils import configure_logging
from app.metrics import record_request
from app.models import Person, User
from app.rate_limit import rate_limiter
from app.utils import EXPORT_DIR, MEDIA_DIR
from app.ws_manager import manager

configure_logging()
logger = logging.getLogger(__name__)

try:
    from app.csrf_middleware import CSRFMiddleware, new_csrf_token
    CSRF_AVAILABLE = True
except Exception as _ce:
    logger.warning("CSRF middleware not available: %s", _ce)
    CSRF_AVAILABLE = False
WS_URL_TTL_SECONDS = 60


def _ws_payload(exp: int) -> str:
    return f"/ws|{exp}"


def _sign_ws_url(exp: int) -> str:
    secret_key = os.getenv("SECRET_KEY") or ""
    digest = hmac.new(secret_key.encode("utf-8"), _ws_payload(exp).encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def _verify_ws_signature(exp: int | None, sig: str | None) -> bool:
    if not exp or not sig or exp < int(time.time()):
        return False
    return hmac.compare_digest(_sign_ws_url(exp), sig)

# -- Optional feature imports --------------------------------------------------

try:
    from app.analytics import router as analytics_router
    ANALYTICS_AVAILABLE = True
except Exception as _e:
    logger.warning("Analytics module not available: %s", _e)
    ANALYTICS_AVAILABLE = False

try:
    from app.cleanup import start_cleanup_scheduler
    CLEANUP_AVAILABLE = True
except Exception as _e:
    logger.warning("Cleanup module not available: %s", _e)
    CLEANUP_AVAILABLE = False

try:
    from app.backup import start_backup_scheduler
    BACKUP_AVAILABLE = True
except Exception as _e:
    logger.warning("Backup module not available: %s", _e)
    BACKUP_AVAILABLE = False

try:
    from app.routers.auth import router as enterprise_auth_router
    ENTERPRISE_AUTH_AVAILABLE = True
except Exception as _ea:
    logger.warning("Enterprise auth router not available: %s", _ea)
    ENTERPRISE_AUTH_AVAILABLE = False

try:
    from app.routers.alerts import router as alerts_router
    from app.routers.ldap_sso import router as ldap_router
    from app.routers.permissions import router as permissions_router
    from app.routers.reports import router as reports_router
    from app.routers.webhooks import router as webhooks_router
    from app.routers.zones import router as zones_router
    ENTERPRISE_ROUTERS_AVAILABLE = True
except Exception as _ee:
    logger.warning("Enterprise routers not fully available: %s", _ee)
    ENTERPRISE_ROUTERS_AVAILABLE = False

try:
    from app.report_scheduler import start_report_scheduler
    REPORT_SCHEDULER_AVAILABLE = True
except Exception as _re:
    logger.warning("Report scheduler not available: %s", _re)
    REPORT_SCHEDULER_AVAILABLE = False

# -- Core routers -------------------------------------------------------------

from app.routers.cameras import router as cameras_router
from app.routers.maps import router as maps_router
from app.routers.video_archive import router as video_archive_router

try:
    from app.routers.webrtc import router as webrtc_router
    WEBRTC_AVAILABLE = True
except Exception as _we:
    logger.warning("WebRTC router not available: %s", _we)
    WEBRTC_AVAILABLE = False
from app.routers.admin import router as admin_router
from app.routers.attendance_pro import router as attendance_pro_router
from app.routers.attendance_rules import router as attendance_rules_router
from app.routers.doors import router as doors_router
from app.routers.events import router as events_router
from app.routers.hikcentral import router as hikcentral_router
from app.routers.licenses import router as licenses_router
from app.routers.persons import router as persons_router
from app.routers.settings import router as settings_router
from app.routers.users_auth import router as users_auth_router
from app.routers.visitor_kiosk import router as visitor_kiosk_router

try:
    from app.routers.access_control import router as acs_router
    from app.routers.acs_access_levels import router as acs_levels_router
    from app.routers.acs_analytics import router as acs_analytics_router
    from app.routers.acs_credential_health import router as acs_credential_health_router
    from app.routers.acs_cards import router as acs_cards_router
    from app.routers.acs_config import router as acs_config_router
    from app.routers.acs_person_management import router as acs_person_management_router
    from app.routers.acs_visitors import router as acs_visitors_router
    from app.routers.face_door import router as face_door_router
    ACS_AVAILABLE = True
except Exception as _acs_e:
    logger.warning("ACS router not available: %s", _acs_e)
    face_door_router = None
    acs_analytics_router = None
    ACS_AVAILABLE = False

try:
    from app.routers.acs_access_requests import router as acs_access_requests_router
    from app.routers.acs_anti_passback import router as acs_anti_passback_router
    from app.routers.acs_audit_report import router as acs_audit_report_router
    from app.routers.acs_bulk_import import router as acs_bulk_import_router
    from app.routers.acs_door_camera import router as acs_door_camera_router
    from app.routers.acs_dual_auth import router as acs_dual_auth_router
    from app.routers.acs_guard_tour import router as acs_guard_tour_router
    from app.routers.acs_holidays import router as acs_holidays_router
    from app.routers.acs_lift import router as acs_lift_router
    from app.routers.acs_mobile_cards import router as acs_mobile_cards_router
    from app.routers.acs_mustering import router as acs_mustering_router
    from app.routers.acs_occupancy import router as acs_occupancy_router
    from app.routers.acs_policy_templates import router as acs_policy_templates_router
    from app.routers.acs_tailgating import router as acs_tailgating_router
    ACS_EXTENDED_AVAILABLE = True
except Exception as _acs_ext_e:
    logger.warning("ACS extended routers not available: %s", _acs_ext_e)
    ACS_EXTENDED_AVAILABLE = False


# -- Lifespan ------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    assert_config_is_startable()
    face_licensed = module_is_licensed(MODULE_FACE)
    acs_licensed = module_is_licensed(MODULE_ACS)
    any_module_licensed = face_licensed or acs_licensed
    if not any_module_licensed:
        logger.warning("No valid module license is installed; product APIs and WebSocket are locked")
    # Security check — warn if alarm endpoint is unprotected
    _alarm_key = os.getenv("ALARM_API_KEY", "")
    _alarm_ips  = os.getenv("ALARM_ALLOWED_IPS", "")
    if not _alarm_key and not _alarm_ips:
        logger.warning(
            "SECURITY: /api/alarm/hikvision is publicly accessible with no auth. "
            "Set ALARM_API_KEY or ALARM_ALLOWED_IPS in .env to restrict access."
        )
    db = next(get_db())
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            default_password = os.getenv("DEFAULT_ADMIN_PASSWORD")
            if not default_password:
                raise RuntimeError("DEFAULT_ADMIN_PASSWORD is required for first startup when no admin user exists.")
            admin = User(
                username="admin",
                password_hash=hash_password(default_password),
                role="admin",
                is_active=1,
            )
            db.add(admin)
            db.commit()
            logger.info("Default admin user created from DEFAULT_ADMIN_PASSWORD")

        if face_licensed:
            try:
                rebuild_faiss_indexes(db, Person)
            except Exception as e:
                logger.warning("FAISS startup rebuild skipped: %s", e)
    finally:
        db.close()

    if CLEANUP_AVAILABLE and any_module_licensed:
        try:
            start_cleanup_scheduler()
        except Exception as e:
            logger.warning("Cleanup scheduler failed to start: %s", e)

    if BACKUP_AVAILABLE and any_module_licensed:
        try:
            start_backup_scheduler()
        except Exception as e:
            logger.warning("Backup scheduler failed to start: %s", e)

    if REPORT_SCHEDULER_AVAILABLE and face_licensed:
        try:
            start_report_scheduler()
        except Exception as e:
            logger.warning("Report scheduler failed to start: %s", e)

    if ACS_AVAILABLE and acs_licensed:
        try:
            from app.acs_access_limit import start_access_limit_monitor
            start_access_limit_monitor()
        except Exception as e:
            logger.warning("ACS access-limit monitor failed to start: %s", e)

    await manager.start_fanout()
    yield

    await manager.stop_fanout()
    # Graceful shutdown: stop any legacy camera worker threads.
    try:
        from app.camera_pool import camera_pool as _pool
        _pool.stop_all()
    except Exception as _e:
        logger.warning("Camera pool shutdown error: %s", _e)


# -- App factory ---------------------------------------------------------------

_app_env = os.getenv("APP_ENV", "production").strip().lower()
ENABLE_API_DOCS = os.getenv("ENABLE_API_DOCS", "1" if _app_env == "development" else "0") == "1"

app = FastAPI(
    title="Face Analytics Pro",
    version="10.0.0",
    description=(
        "AI-powered face analytics and access control platform.\n\n"
        "**Modules:** `face_analytics` — camera event recognition; "
        "`access_controller` — Hikvision ACS device management.\n\n"
        "All endpoints (except `/api/auth` and `/api/license`) require a valid JWT "
        "access token in the `Authorization: Bearer <token>` header."
    ),
    contact={"name": "GSC Support"},
    lifespan=lifespan,
    docs_url="/docs" if ENABLE_API_DOCS else None,
    redoc_url="/redoc" if ENABLE_API_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_API_DOCS else None,
)

def _local_lan_origins() -> list[str]:
    if os.getenv("AUTO_LAN_ORIGINS", "1").strip().lower() in {"0", "false", "no", "off"}:
        return []

    addresses: set[str] = set()
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addresses.add(item[4][0])
    except OSError:
        pass

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            addresses.add(sock.getsockname()[0])
    except OSError:
        pass

    origins: list[str] = []
    for address in sorted(addresses):
        try:
            parsed = ipaddress.ip_address(address)
        except ValueError:
            continue
        if parsed.is_loopback or parsed.is_link_local:
            continue
        if parsed.is_private:
            origins.extend([f"http://{address}:5173", f"http://{address}:3000"])
    return origins


ALLOWED_ORIGINS = sorted({
    *[
        o.strip()
        for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000").split(",")
        if o.strip()
    ],
    *_local_lan_origins(),
})
ALLOWED_HOSTS = [h.strip() for h in os.getenv("ALLOWED_HOSTS", "").split(",") if h.strip()]

if ALLOWED_HOSTS:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

# GZip all JSON responses ≥ 500 bytes — 50-70% size reduction
app.add_middleware(GZipMiddleware, minimum_size=500)

# CSRF protection for cookie-authenticated requests
_csrf_default = "1" if _app_env == "production" else "0"
if CSRF_AVAILABLE and os.getenv("ENABLE_CSRF", _csrf_default) == "1":
    app.add_middleware(CSRFMiddleware)
    logger.info("CSRF middleware enabled")

ALLOWED_HEADERS = [
    "Authorization", "Content-Type", "X-Request-ID",
    "X-CSRF-Token", "Accept", "Origin", "X-Requested-With",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=ALLOWED_HEADERS,
    expose_headers=["X-Total-Count", "X-Limit", "X-Offset", "Content-Disposition"],
    max_age=600,
)


_GLOBAL_RATE_LIMIT = int(os.getenv("GLOBAL_RATE_LIMIT", "200"))  # requests/minute per IP
_GLOBAL_RATE_EXEMPT = ("/api/auth", "/api/legacy/auth", "/api/license", "/api/csrf-token", "/health", "/ready")


@app.middleware("http")
async def global_rate_limit(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and not path.startswith(_GLOBAL_RATE_EXEMPT):
        forwarded_for = request.headers.get("X-Forwarded-For", "")
        ip = forwarded_for.split(",")[0].strip() if forwarded_for else (
            request.client.host if request.client else "unknown"
        )
        count = rate_limiter.hit_fixed_window(f"global:{ip}", _GLOBAL_RATE_LIMIT, 60)
        if count > _GLOBAL_RATE_LIMIT:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": "60"},
            )
    return await call_next(request)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    request.state.request_id = request_id
    started = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - started
    record_request(request.method, request.url.path, response.status_code, elapsed)
    response.headers.setdefault("X-Request-ID", request_id)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    logger.info(
        "request_id=%s method=%s path=%s status=%s latency_ms=%.2f",
        request_id, request.method, request.url.path, response.status_code, elapsed * 1000,
    )
    return response


@app.middleware("http")
async def enforce_module_license(request: Request, call_next):
    required_module = required_module_for_path(request.url.path)
    if required_module and not module_is_licensed(required_module):
        status = license_status()
        return JSONResponse(
            status_code=402,
            content={
                "detail": {
                    "code": "LICENSE_REQUIRED",
                    "module": required_module,
                    "message": (
                        "At least one valid module license is required"
                        if required_module == MODULE_ANY
                        else f"A valid {required_module} license is required"
                    ),
                    "license_error": status.get("error"),
                }
            },
        )
    return await call_next(request)


# -- Router registration -------------------------------------------------------

app.include_router(cameras_router)
app.include_router(maps_router)
app.include_router(video_archive_router)
if WEBRTC_AVAILABLE:
    app.include_router(webrtc_router)
    logger.info("WebRTC router registered")
app.include_router(persons_router)
app.include_router(events_router)
app.include_router(users_auth_router)
app.include_router(admin_router)
app.include_router(doors_router)
app.include_router(settings_router)
app.include_router(attendance_rules_router)
app.include_router(attendance_pro_router)
app.include_router(licenses_router)
app.include_router(hikcentral_router)
app.include_router(visitor_kiosk_router)

if ACS_AVAILABLE:
    app.include_router(acs_cards_router)
    app.include_router(acs_visitors_router)
    app.include_router(acs_config_router)
    app.include_router(acs_levels_router)
    app.include_router(acs_person_management_router)
    if face_door_router:
        app.include_router(face_door_router)
    if acs_analytics_router:
        app.include_router(acs_analytics_router)
        app.include_router(acs_credential_health_router)
    # Keep the generic /api/acs/{device_id} routes after named ACS sub-routes.
    app.include_router(acs_router)
    logger.info("ACS routers registered (devices, cards, visitors, config, access levels, face-door, analytics)")

if ACS_EXTENDED_AVAILABLE:
    app.include_router(acs_anti_passback_router)
    app.include_router(acs_dual_auth_router)
    app.include_router(acs_tailgating_router)
    app.include_router(acs_guard_tour_router)
    app.include_router(acs_mustering_router)
    app.include_router(acs_access_requests_router)
    app.include_router(acs_holidays_router)
    app.include_router(acs_lift_router)
    app.include_router(acs_audit_report_router)
    app.include_router(acs_bulk_import_router)
    app.include_router(acs_policy_templates_router)
    app.include_router(acs_door_camera_router)
    app.include_router(acs_mobile_cards_router)
    app.include_router(acs_occupancy_router)
    logger.info("ACS extended routers registered (anti-passback, dual-auth, tailgating, guard-tour, mustering, access-requests, holidays, lift, audit, bulk-import, policy-templates, door-camera, mobile-cards, occupancy)")

if ANALYTICS_AVAILABLE:
    app.include_router(analytics_router)
    logger.info("Analytics router registered")

if ENTERPRISE_AUTH_AVAILABLE:
    app.include_router(enterprise_auth_router)
    logger.info("Enterprise auth router registered")

if ENTERPRISE_ROUTERS_AVAILABLE:
    app.include_router(zones_router)
    app.include_router(alerts_router)
    app.include_router(webhooks_router)
    app.include_router(reports_router)
    app.include_router(ldap_router)
    app.include_router(permissions_router)
    logger.info("Enterprise routers registered")


# -- Built-in endpoints --------------------------------------------------------

@app.get("/")
def root():
    return {"status": "ok", "service": "Face Analytics Pro API"}


@app.get("/api/csrf-token")
def get_csrf_token():
    """Issue a CSRF token. Frontend must send it back as X-CSRF-Token header."""
    if not CSRF_AVAILABLE:
        return {"csrf_token": None, "enabled": False}
    token = new_csrf_token()
    from fastapi.responses import JSONResponse
    response = JSONResponse({"csrf_token": token, "enabled": True})
    response.set_cookie(
        "csrf_token", token,
        httponly=False,   # JS must read it
        samesite="strict",
        secure=os.getenv("COOKIE_SECURE", "0") == "1",
        max_age=3600,
    )
    return response


@app.get("/api/ws-url")
def get_websocket_url(current_user=Depends(get_current_user)):
    exp = int(time.time()) + WS_URL_TTL_SECONDS
    return {"url": f"/ws?exp={exp}&sig={_sign_ws_url(exp)}", "expires_at": exp}


@app.get("/health")
def health_check(db=Depends(get_db)):
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass
    return {
        "status": "ok" if db_ok else "degraded",
        "version": app.version,
        "db": "ok" if db_ok else "error",
        "faiss": "ok" if FAISS_AVAILABLE else "unavailable",
        "ws_connections": len(manager.active_connections),
    }


@app.get("/ready")
def readiness_check(db=Depends(get_db)):
    checks = {}
    try:
        db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"error: {e.__class__.__name__}"

    checks["media_dir"] = "ok" if os.path.isdir(MEDIA_DIR) and os.access(MEDIA_DIR, os.W_OK) else "error"
    checks["export_dir"] = "ok" if os.path.isdir(EXPORT_DIR) and os.access(EXPORT_DIR, os.W_OK) else "error"

    try:
        from app.operations import media_storage_status

        storage = media_storage_status(MEDIA_DIR)
        checks["media_storage"] = "ok" if storage["ok"] else f"error: {','.join(storage['reasons'])}"
        checks["media_gb"] = storage["media_gb"]
        checks["disk_free_gb"] = storage["disk_free_gb"]
    except Exception as e:
        checks["media_storage"] = f"error: {e.__class__.__name__}"

    config_issues = validate_app_config()
    checks["config_errors"] = len([i for i in config_issues if i.level == "error"])
    checks["config_warnings"] = len([i for i in config_issues if i.level == "warning"])
    checks["faiss"] = "ok" if FAISS_AVAILABLE else "unavailable"
    checks["ws_connections"] = len(manager.active_connections)

    failed = [name for name, value in checks.items() if isinstance(value, str) and value.startswith("error")]

    return {
        "status": "ready" if not failed and checks["config_errors"] == 0 else "not_ready",
        "version": app.version,
        "checks": checks,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = "", exp: int | None = None, sig: str | None = None):
    if not module_is_licensed(MODULE_ANY):
        await websocket.close(code=4402, reason="License required")
        return
    db = next(get_db())
    try:
        from fastapi import HTTPException
        if not _verify_ws_signature(exp, sig):
            authenticate_token(token, db)
    except HTTPException:
        await websocket.close(code=4001)
        return
    finally:
        db.close()

    accepted = await manager.connect(websocket)
    if not accepted:
        return

    ws_read_timeout = float(os.getenv("WS_READ_TIMEOUT_SECONDS", "300"))
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=ws_read_timeout)
            except asyncio.TimeoutError:
                logger.debug("WebSocket idle timeout, closing connection")
                break
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong", "ts": msg.get("ts")})
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("WebSocket endpoint error: %s", e)
    finally:
        manager.disconnect(websocket)
