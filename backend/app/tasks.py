"""
tasks.py - Async Celery tasks for heavy face processing operations.

These tasks offload CPU-intensive and I/O work from the FastAPI request thread
so that alarm ingest endpoints return immediately (< 200 ms) while recognition
happens in the background worker process.

Integration:
    Replace the synchronous face processing in routers/events.py with:

        from app.tasks import process_face_async
        process_face_async.apply_async(args=[payload_b64, camera_id], queue="face_processing")

    The worker writes the resulting FaceEvent rows to PostgreSQL directly.
"""

import base64
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

try:
    from app.celery_app import celery_app
    CELERY_AVAILABLE = True
except Exception as e:
    logger.warning("Celery not available: %s", e)
    CELERY_AVAILABLE = False

if CELERY_AVAILABLE:
    @celery_app.task(
        bind=True,
        name="app.tasks.process_face_async",
        queue="face_processing",
        max_retries=3,
        default_retry_delay=5,
        soft_time_limit=30,
        time_limit=60,
    )
    def process_face_async(self, image_b64: str, camera_id: int, metadata: dict):
        """
        Decode image, run face detection + recognition, persist FaceEvent rows.

        Args:
            image_b64: Base64-encoded JPEG image.
            camera_id: CameraDevice.id to look up name/direction/settings.
            metadata: Extra context (alarm payload fields, raw_payload, etc.).
        """
        from app.db import SessionLocal
        from app.models import CameraDevice, Person, FaceEvent
        from app.face_engine import extract_faces
        from app.faiss_engine import search_face, rebuild_faiss_indexes
        from app.utils import save_media_image, MEDIA_DIR
        from app.ws_manager import manager
        import asyncio
        import numpy as np
        import cv2

        db = SessionLocal()
        try:
            camera = db.query(CameraDevice).filter(CameraDevice.id == camera_id).first()
            if not camera:
                logger.error("Camera %s not found", camera_id)
                return {"status": "error", "reason": "camera_not_found"}

            img_bytes = base64.b64decode(image_b64)
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return {"status": "error", "reason": "decode_failed"}

            faces = extract_faces(img)
            if not faces:
                return {"status": "ok", "faces": 0}

            results = []
            for face in faces:
                embedding = face.get("embedding")
                person_id = None
                confidence = 0.0

                if embedding is not None:
                    try:
                        match = search_face(embedding)
                        if match:
                            person_id = match["person_id"]
                            confidence = match["confidence"]
                    except Exception as search_exc:
                        logger.warning("FAISS search failed for face: %s", search_exc)

                event = FaceEvent(
                    person_id=person_id,
                    camera_id=camera.id,
                    camera_ip=camera.ip_address,
                    camera_name=camera.name,
                    source="face_analytics",
                    confidence=confidence,
                    age=face.get("age"),
                    gender=face.get("gender"),
                    face_quality=face.get("quality", 0.0),
                    direction=camera.direction,
                    raw_payload=json.dumps(metadata, default=str)[:20000],
                    created_at=datetime.now(timezone.utc),
                )
                db.add(event)
                results.append(person_id)

            db.commit()
            logger.info("process_face_async: camera=%s faces=%d", camera.name, len(faces))
            return {"status": "ok", "faces": len(faces), "persons": results}

        except Exception as exc:
            db.rollback()
            logger.exception("process_face_async failed: %s", exc)
            raise self.retry(exc=exc, countdown=min(300, 5 * 2 ** self.request.retries))
        finally:
            db.close()


    @celery_app.task(
        name="app.tasks.send_alert_async",
        queue="notifications",
        max_retries=3,
        default_retry_delay=10,
    )
    def send_alert_async(event_id: int):
        """Evaluate and dispatch alert notifications for a FaceEvent."""
        from app.db import SessionLocal
        from app.models import FaceEvent
        from app.alert_engine import evaluate_and_send

        db = SessionLocal()
        try:
            event = db.query(FaceEvent).filter(FaceEvent.id == event_id).first()
            if event:
                evaluate_and_send(db, event)
        except Exception as exc:
            logger.exception("send_alert_async failed: %s", exc)
        finally:
            db.close()


    @celery_app.task(
        name="app.tasks.rebuild_faiss_async",
        queue="faiss",
        max_retries=1,
    )
    def rebuild_faiss_async():
        """Rebuild FAISS indexes in background after person updates."""
        from app.db import SessionLocal
        from app.models import Person
        from app.faiss_engine import rebuild_faiss_indexes

        db = SessionLocal()
        try:
            rebuild_faiss_indexes(db, Person)
            logger.info("FAISS indexes rebuilt via async task")
        except Exception as exc:
            logger.exception("rebuild_faiss_async failed: %s", exc)
        finally:
            db.close()
