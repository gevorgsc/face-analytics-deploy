"""Redis-backed coordination with safe single-process fallbacks."""

import logging
import os
import threading
import time
import uuid
from contextlib import contextmanager

logger = logging.getLogger(__name__)

_RELEASE_LOCK_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
"""


class DistributedCoordinator:
    def __init__(self, redis_url: str | None = None):
        self.redis_url = redis_url or os.getenv("REDIS_URL", "")
        self._redis = None
        self._memory_locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()
        if self.redis_url:
            try:
                import redis

                client = redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=3,
                    socket_timeout=3,
                )
                client.ping()
                self._redis = client
                logger.info("Distributed coordinator connected to Redis")
            except Exception as exc:
                logger.warning("Redis coordination unavailable; using process-local locks: %s", exc)

    @property
    def is_distributed(self) -> bool:
        return self._redis is not None

    def _memory_lock(self, name: str) -> threading.Lock:
        with self._guard:
            return self._memory_locks.setdefault(name, threading.Lock())

    @contextmanager
    def lock(self, name: str, ttl_seconds: int, blocking_timeout: float = 0):
        key = f"face-analytics:lock:{name}"
        token = uuid.uuid4().hex
        acquired = False
        memory_lock = None

        if self._redis is not None:
            deadline = time.monotonic() + max(0, blocking_timeout)
            while True:
                try:
                    acquired = bool(self._redis.set(key, token, nx=True, ex=max(1, ttl_seconds)))
                except Exception as exc:
                    logger.warning("Redis lock %s failed; distributed task skipped: %s", name, exc)
                    break
                if acquired or time.monotonic() >= deadline:
                    break
                time.sleep(0.1)
        else:
            memory_lock = self._memory_lock(name)
            acquired = memory_lock.acquire(timeout=max(0, blocking_timeout))

        try:
            yield acquired
        finally:
            if not acquired:
                return
            if self._redis is not None:
                try:
                    self._redis.eval(_RELEASE_LOCK_SCRIPT, 1, key, token)
                except Exception as exc:
                    logger.warning("Redis lock %s release failed: %s", name, exc)
            elif memory_lock is not None:
                memory_lock.release()


coordinator = DistributedCoordinator()
