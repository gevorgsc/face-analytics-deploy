import logging
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

from app.env import load_app_env

load_app_env()

PLACEHOLDER_MARKERS = (
    "CHANGE_ME",
    "CHANGE_THIS",
    "generate_a_random",
    "strong_password",
)


@dataclass(frozen=True)
class ConfigIssue:
    level: str
    message: str


def _has_placeholder(value: str | None) -> bool:
    if not value:
        return False
    upper = value.upper()
    return any(marker.upper() in upper for marker in PLACEHOLDER_MARKERS)


def _int_env(name: str, default: int, minimum: int | None = None) -> ConfigIssue | None:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError:
        return ConfigIssue("error", f"{name} must be an integer")
    if minimum is not None and value < minimum:
        return ConfigIssue("error", f"{name} must be >= {minimum}")
    return None


def validate_app_config() -> list[ConfigIssue]:
    issues: list[ConfigIssue] = []

    secret_key = os.getenv("SECRET_KEY")
    if not secret_key:
        issues.append(ConfigIssue("error", "SECRET_KEY is required"))
    elif len(secret_key) < 48 or _has_placeholder(secret_key):
        issues.append(ConfigIssue("error", "SECRET_KEY must be a strong random value"))

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        issues.append(ConfigIssue("error", "DATABASE_URL is required"))
    else:
        parsed = urlparse(database_url.replace("postgresql+psycopg2://", "postgresql://"))
        if parsed.scheme not in {"postgresql", "sqlite"}:
            issues.append(ConfigIssue("warning", "PostgreSQL is recommended for production"))
        if parsed.password and _has_placeholder(parsed.password):
            issues.append(ConfigIssue("warning", "DATABASE_URL appears to contain a placeholder password"))

    default_admin_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "")
    if default_admin_password and (
        len(default_admin_password) < 12
        or _has_placeholder(default_admin_password)
        or default_admin_password.lower() in {"admin", "password", "gscadmin123"}
    ):
        issues.append(ConfigIssue("warning", "DEFAULT_ADMIN_PASSWORD should be rotated to a stronger value"))

    camera_key = os.getenv("CAMERA_PASSWORD_KEY", "")
    if not camera_key:
        issues.append(ConfigIssue("warning", "CAMERA_PASSWORD_KEY is not set — camera passwords will not be encrypted at rest"))
    elif _has_placeholder(camera_key):
        issues.append(ConfigIssue("warning", "CAMERA_PASSWORD_KEY is still a placeholder"))

    allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if "*" in allowed_origins:
        issues.append(ConfigIssue("error", "ALLOWED_ORIGINS must not contain '*' when credentials are enabled"))

    app_env = os.getenv("APP_ENV", "production").strip().lower()
    cookie_samesite = os.getenv("COOKIE_SAMESITE", "lax").strip().lower()
    if cookie_samesite not in {"lax", "strict", "none"}:
        issues.append(ConfigIssue("error", "COOKIE_SAMESITE must be lax, strict, or none"))
    if cookie_samesite == "none" and os.getenv("COOKIE_SECURE", "0") != "1":
        issues.append(ConfigIssue("error", "COOKIE_SECURE must be 1 when COOKIE_SAMESITE=none"))

    if app_env == "production":
        if os.getenv("COOKIE_SECURE", "0") != "1":
            issues.append(ConfigIssue("warning", "COOKIE_SECURE should be 1 in production HTTPS deployments"))
        if os.getenv("ENABLE_API_DOCS", "0") == "1":
            issues.append(ConfigIssue("warning", "ENABLE_API_DOCS should normally be 0 in production"))
        if not [h.strip() for h in os.getenv("ALLOWED_HOSTS", "").split(",") if h.strip()]:
            issues.append(ConfigIssue("warning", "ALLOWED_HOSTS should be explicitly configured in production"))
        if os.getenv("RATE_LIMIT_BACKEND", "memory").strip().lower() != "redis":
            issues.append(ConfigIssue("warning", "RATE_LIMIT_BACKEND=redis is recommended in production"))

    alarm_key = os.getenv("ALARM_API_KEY", "").strip()
    alarm_ips = [ip.strip() for ip in os.getenv("ALARM_ALLOWED_IPS", "").split(",") if ip.strip()]
    alarm_open = os.getenv("ALARM_OPEN_ACCESS", "0").strip().lower() in {"1", "true", "yes", "on"}
    if alarm_open and app_env == "production":
        issues.append(ConfigIssue("warning", "ALARM_OPEN_ACCESS should be disabled in production"))
    if not alarm_key and not alarm_ips and not alarm_open:
        issues.append(ConfigIssue("warning", "Alarm ingestion is disabled until ALARM_API_KEY or ALARM_ALLOWED_IPS is configured"))

    for name, default, minimum in [
        ("ACCESS_TOKEN_EXPIRE_MINUTES", 720, 1),
        ("MAX_UPLOAD_MB", 10, 1),
        ("FACE_WORKERS", 2, 1),
        ("ALARM_RATE_LIMIT", 60, 1),
        ("LOGIN_MAX_FAILED_ATTEMPTS", 5, 1),
        ("LOGIN_WINDOW_SECONDS", 60, 1),
        ("LOGIN_BLOCK_MINUTES", 5, 1),
        ("DB_POOL_SIZE", 10, 1),
        ("DB_MAX_OVERFLOW", 20, 0),
    ]:
        issue = _int_env(name, default, minimum)
        if issue:
            issues.append(issue)

    rate_limit_backend = os.getenv("RATE_LIMIT_BACKEND", "memory").strip().lower()
    if rate_limit_backend not in {"memory", "redis"}:
        issues.append(ConfigIssue("error", "RATE_LIMIT_BACKEND must be memory or redis"))
    if rate_limit_backend == "redis":
        redis_url = os.getenv("REDIS_URL", "")
        parsed = urlparse(redis_url)
        if parsed.scheme not in {"redis", "rediss"}:
            issues.append(ConfigIssue("error", "REDIS_URL must start with redis:// or rediss://"))

    hikcentral_url = os.getenv("HIKCENTRAL_URL", "").strip()
    if hikcentral_url:
        parsed = urlparse(hikcentral_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            issues.append(ConfigIssue("error", "HIKCENTRAL_URL must be a valid HTTP(S) URL"))
        auth_mode = os.getenv("HIKCENTRAL_AUTH_MODE", "artemis").strip().lower()
        if auth_mode not in {"artemis", "basic"}:
            issues.append(ConfigIssue("error", "HIKCENTRAL_AUTH_MODE must be artemis or basic"))
        if auth_mode == "artemis" and not (
            os.getenv("HIKCENTRAL_APP_KEY") and os.getenv("HIKCENTRAL_APP_SECRET")
        ):
            issues.append(ConfigIssue("warning", "HikCentral URL is set but AppKey/AppSecret are missing"))

    license_enforcement = os.getenv("LICENSE_ENFORCEMENT", "1").strip().lower()
    if license_enforcement not in {"0", "1", "false", "true", "no", "yes", "off", "on"}:
        issues.append(ConfigIssue("error", "LICENSE_ENFORCEMENT must be a boolean value"))
    if license_enforcement in {"1", "true", "yes", "on"}:
        public_key = os.getenv("LICENSE_PUBLIC_KEY_FILE", "license_public_key.pem")
        public_key_path = Path(public_key)
        if not public_key_path.is_absolute():
            public_key_path = Path(__file__).resolve().parents[1] / public_key_path
        if not public_key_path.exists():
            issues.append(ConfigIssue("error", f"LICENSE_PUBLIC_KEY_FILE not found: {public_key_path}"))

    return issues


def assert_config_is_startable() -> None:
    issues = validate_app_config()
    for issue in issues:
        if issue.level == "error":
            logger.error("[Config] %s", issue.message)
        else:
            logger.warning("[Config] %s", issue.message)

    errors = [issue.message for issue in issues if issue.level == "error"]
    if errors:
        raise RuntimeError("Invalid application config: " + "; ".join(errors))
