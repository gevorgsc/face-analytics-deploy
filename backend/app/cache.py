"""Redis caching layer with in-memory fallback.

Usage:
    from app.cache import cache

    @cache.cached("stats:dashboard", ttl=60)
    def expensive_query():
        ...

    cache.invalidate("stats:*")
"""

import json
import logging
import time
import threading
from typing import Any, Optional
from functools import wraps

logger = logging.getLogger(__name__)


class InMemoryCache:
    """Thread-safe in-memory TTL cache with LRU eviction (Redis fallback)."""

    def __init__(self, maxsize: int = 1000):
        self._store: dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()
        self._maxsize = maxsize

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            item = self._store.get(key)
            if item is None:
                return None
            value, expires_at = item
            if expires_at and time.time() > expires_at:
                del self._store[key]
                return None
            return value

    def _evict_expired_or_oldest(self) -> None:
        now = time.time()
        expired = [k for k, (_, exp) in self._store.items() if exp and now > exp]
        if expired:
            for k in expired:
                del self._store[k]
            return
        if self._store:
            del self._store[next(iter(self._store))]

    def set(self, key: str, value: Any, ttl: int = 60) -> None:
        with self._lock:
            expires_at = time.time() + ttl if ttl else None
            if key not in self._store and len(self._store) >= self._maxsize:
                self._evict_expired_or_oldest()
            self._store[key] = (value, expires_at)

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def invalidate_pattern(self, pattern: str) -> int:
        prefix = pattern.rstrip("*")
        with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                del self._store[k]
        return len(keys)

    def flush(self) -> None:
        with self._lock:
            self._store.clear()


class RedisCache:
    """Redis-backed cache."""

    def __init__(self, redis_client):
        self._redis = redis_client

    def get(self, key: str) -> Optional[Any]:
        try:
            raw = self._redis.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as e:
            logger.debug("Redis get error: %s", e)
            return None

    def set(self, key: str, value: Any, ttl: int = 60) -> None:
        try:
            self._redis.setex(key, ttl, json.dumps(value, default=str))
        except Exception as e:
            logger.debug("Redis set error: %s", e)

    def delete(self, key: str) -> None:
        try:
            self._redis.delete(key)
        except Exception as e:
            logger.debug("Redis delete error: %s", e)

    def invalidate_pattern(self, pattern: str) -> int:
        try:
            keys = self._redis.keys(pattern)
            if keys:
                self._redis.delete(*keys)
            return len(keys)
        except Exception as e:
            logger.debug("Redis invalidate error: %s", e)
            return 0

    def flush(self) -> None:
        try:
            self._redis.flushdb()
        except Exception as e:
            logger.debug("Redis flush error: %s", e)


def _build_cache():
    import os
    redis_url = os.getenv("REDIS_URL", "")
    if not redis_url:
        logger.info("No REDIS_URL configured - using in-memory cache")
        return InMemoryCache()
    try:
        import redis
        client = redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=3)
        client.ping()
        logger.info("Redis cache connected: %s", redis_url.split("@")[-1])
        return RedisCache(client)
    except Exception as e:
        logger.warning("Redis unavailable (%s) - falling back to in-memory cache", e)
        return InMemoryCache()


cache = _build_cache()


def cached(key: str, ttl: int = 60):
    """Decorator that caches the return value of a sync function."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            hit = cache.get(key)
            if hit is not None:
                return hit
            result = fn(*args, **kwargs)
            cache.set(key, result, ttl)
            return result
        return wrapper
    return decorator


def cached_async(key: str, ttl: int = 60):
    """Decorator that caches the return value of an async function."""
    def decorator(fn):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            hit = cache.get(key)
            if hit is not None:
                return hit
            result = await fn(*args, **kwargs)
            cache.set(key, result, ttl)
            return result
        return wrapper
    return decorator
