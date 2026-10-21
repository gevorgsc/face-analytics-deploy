from app.config import validate_app_config


def _clear_env(monkeypatch):
    for key in [
        "SECRET_KEY",
        "DATABASE_URL",
        "DEFAULT_ADMIN_PASSWORD",
        "CAMERA_PASSWORD_KEY",
        "ALLOWED_ORIGINS",
        "ACCESS_TOKEN_EXPIRE_MINUTES",
        "MAX_UPLOAD_MB",
        "FACE_WORKERS",
        "ALARM_RATE_LIMIT",
        "DB_POOL_SIZE",
        "DB_MAX_OVERFLOW",
    ]:
        monkeypatch.delenv(key, raising=False)


def test_config_accepts_strong_minimal_settings(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://user:pass@localhost:5432/db")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173")

    issues = validate_app_config()

    assert [issue for issue in issues if issue.level == "error"] == []


def test_config_rejects_placeholder_secret(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("SECRET_KEY", "CHANGE_ME_generate_a_random_64_char_secret")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://user:pass@localhost:5432/db")

    issues = validate_app_config()

    assert any(issue.level == "error" and "SECRET_KEY" in issue.message for issue in issues)


def test_config_rejects_wildcard_cors(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://user:pass@localhost:5432/db")
    monkeypatch.setenv("ALLOWED_ORIGINS", "*,http://localhost:5173")

    issues = validate_app_config()

    assert any(issue.level == "error" and "ALLOWED_ORIGINS" in issue.message for issue in issues)


def test_config_warns_about_weak_default_admin_password(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://user:pass@localhost:5432/db")
    monkeypatch.setenv("DEFAULT_ADMIN_PASSWORD", "GSCadmin123")

    issues = validate_app_config()

    assert any(issue.level == "warning" and "DEFAULT_ADMIN_PASSWORD" in issue.message for issue in issues)


def test_config_rejects_unknown_rate_limit_backend(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://user:pass@localhost:5432/db")
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "other")

    issues = validate_app_config()

    assert any(issue.level == "error" and "RATE_LIMIT_BACKEND" in issue.message for issue in issues)


def test_config_rejects_bad_redis_url(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://user:pass@localhost:5432/db")
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "redis")
    monkeypatch.setenv("REDIS_URL", "http://localhost:6379")

    issues = validate_app_config()

    assert any(issue.level == "error" and "REDIS_URL" in issue.message for issue in issues)
