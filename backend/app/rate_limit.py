import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import redis
except Exception:
    redis = None


def now_utc():
    return datetime.now(timezone.utc)


@dataclass
class LoginFailureResult:
    remaining_attempts: int
    blocked_until: Optional[datetime]


class MemoryRateLimiter:
    def __init__(self):
        self._attempts: dict[str, dict] = {}
        self._fixed_windows: dict[str, tuple[float, int]] = {}

    def check_block(self, key: str) -> Optional[int]:
        data = self._attempts.get(key)
        if not data:
            return None
        blocked_until = data.get("blocked_until")
        if blocked_until and now_utc() < blocked_until:
            return int((blocked_until - now_utc()).total_seconds())
        return None

    def register_login_failed(
        self,
        key: str,
        max_attempts: int,
        window_seconds: int,
        block_seconds: int,
    ) -> LoginFailureResult:
        current = now_utc()
        data = self._attempts.get(key)
        if not data or current - data["first_attempt"] > timedelta(seconds=window_seconds):
            self._attempts[key] = {
                "count": 1,
                "first_attempt": current,
                "blocked_until": None,
            }
            return LoginFailureResult(max_attempts - 1, None)

        data["count"] += 1
        remaining = max(0, max_attempts - data["count"])
        if data["count"] >= max_attempts:
            blocked_until = current + timedelta(seconds=block_seconds)
            data["blocked_until"] = blocked_until
            return LoginFailureResult(0, blocked_until)
        return LoginFailureResult(remaining, None)

    def clear_login(self, key: str) -> None:
        self._attempts.pop(key, None)

    def hit_fixed_window(self, key: str, limit: int, window_seconds: int) -> int:
        current = time.monotonic()
        window_start, count = self._fixed_windows.get(key, (current, 0))
        if current - window_start >= window_seconds:
            window_start, count = current, 0
        count += 1
        self._fixed_windows[key] = (window_start, count)
        return count


class RedisRateLimiter:
    def __init__(self, url: str):
        if redis is None:
            raise RuntimeError("redis package is not installed")
        self.client = redis.Redis.from_url(url, decode_responses=True)
        self.client.ping()

    def check_block(self, key: str) -> Optional[int]:
        ttl = self.client.ttl(f"rl:block:{key}")
        return ttl if ttl and ttl > 0 else None

    def register_login_failed(
        self,
        key: str,
        max_attempts: int,
        window_seconds: int,
        block_seconds: int,
    ) -> LoginFailureResult:
        attempts_key = f"rl:login:{key}"
        count = int(self.client.incr(attempts_key))
        if count == 1:
            self.client.expire(attempts_key, window_seconds)

        remaining = max(0, max_attempts - count)
        if count >= max_attempts:
            block_key = f"rl:block:{key}"
            self.client.setex(block_key, block_seconds, "1")
            blocked_until = now_utc() + timedelta(seconds=block_seconds)
            return LoginFailureResult(0, blocked_until)
        return LoginFailureResult(remaining, None)

    def clear_login(self, key: str) -> None:
        self.client.delete(f"rl:login:{key}")
        self.client.delete(f"rl:block:{key}")

    def hit_fixed_window(self, key: str, limit: int, window_seconds: int) -> int:
        redis_key = f"rl:fixed:{key}"
        count = int(self.client.incr(redis_key))
        if count == 1:
            self.client.expire(redis_key, window_seconds)
        return count


def build_rate_limiter():
    backend = os.getenv("RATE_LIMIT_BACKEND", "memory").strip().lower()
    if backend == "redis":
        url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        try:
            return RedisRateLimiter(url)
        except Exception as e:
            logger.warning("Redis unavailable, falling back to memory rate limiter: %s", e)
    return MemoryRateLimiter()


rate_limiter = build_rate_limiter()
