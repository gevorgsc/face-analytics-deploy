"""
celery_app.py - Celery application factory for async face processing tasks.

Broker  : Redis (same instance used for rate limiting)
Backend : Redis (stores task results)

Usage in workers:
    celery -A app.celery_app worker --loglevel=info --concurrency=2

Usage in code:
    from app.tasks import process_face_async
    result = process_face_async.delay(payload_json, camera_id)
"""

import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)

celery_app = Celery(
    "face_analytics",
    broker=CELERY_BROKER,
    backend=CELERY_BACKEND,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Yerevan",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.tasks.process_face_async": {"queue": "face_processing"},
        "app.tasks.send_alert_async": {"queue": "notifications"},
        "app.tasks.rebuild_faiss_async": {"queue": "faiss"},
    },
    task_default_queue="default",
    task_queues_max_priority=10,
    result_expires=3600,
    worker_max_tasks_per_child=200,
)
