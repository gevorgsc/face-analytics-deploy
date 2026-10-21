import os
from fastapi import HTTPException

from app.rate_limit import rate_limiter

MAX_FAILED_ATTEMPTS = int(os.getenv("LOGIN_MAX_FAILED_ATTEMPTS", "5"))
WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", "60"))
BLOCK_MINUTES = int(os.getenv("LOGIN_BLOCK_MINUTES", "5"))


def _block_detail(remaining: int):
    return {
        "message": "Too many failed login attempts. IP temporarily blocked.",
        "blocked": True,
        "blocked_seconds": remaining,
        "blocked_minutes": max(1, remaining // 60),
    }


def check_login_rate_limit(ip: str):
    remaining = rate_limiter.check_block(f"login:{ip}")
    if remaining:
        raise HTTPException(status_code=429, detail=_block_detail(remaining))


def register_login_failed(ip: str):
    result = rate_limiter.register_login_failed(
        key=f"login:{ip}",
        max_attempts=MAX_FAILED_ATTEMPTS,
        window_seconds=WINDOW_SECONDS,
        block_seconds=BLOCK_MINUTES * 60,
    )
    return result.remaining_attempts, result.blocked_until


def register_login_success(ip: str):
    rate_limiter.clear_login(f"login:{ip}")
