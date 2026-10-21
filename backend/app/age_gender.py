"""Age and gender estimation using InsightFace's attribute analysis model."""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_model = None
_model_loaded = False


def _load_model():
    global _model, _model_loaded
    if _model_loaded:
        return _model
    _model_loaded = True
    try:
        import insightface
        from insightface.app import FaceAnalysis
        ctx_id = int(os.getenv("INSIGHTFACE_CTX_ID", "-1"))
        app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "genderage"])
        app.prepare(ctx_id=ctx_id, det_size=(640, 640))
        _model = app
        logger.info("Age/gender model loaded")
    except Exception as e:
        logger.warning("Age/gender model unavailable: %s", e)
        _model = None
    return _model


def estimate_age_gender(image_path: str, bbox) -> Optional[dict]:
    """
    Estimate age and gender for a face crop.
    Returns dict with {age, gender, gender_label} or None.
    """
    app = _load_model()
    if app is None:
        return None

    try:
        import cv2
        img = cv2.imread(image_path)
        if img is None:
            return None

        x1, y1, x2, y2 = [int(v) for v in bbox]
        pad = 20
        h, w = img.shape[:2]
        x1c = max(0, x1 - pad)
        y1c = max(0, y1 - pad)
        x2c = min(w, x2 + pad)
        y2c = min(h, y2 + pad)
        crop = img[y1c:y2c, x1c:x2c]

        if crop.size == 0:
            return None

        faces = app.get(crop)
        if not faces:
            return None

        face = faces[0]
        age = int(getattr(face, "age", 0) or 0)
        gender_raw = getattr(face, "gender", None)

        if gender_raw is None:
            return {"age": age, "gender": None, "gender_label": "Unknown"}

        gender = int(gender_raw)
        gender_label = "Male" if gender == 1 else "Female"
        return {"age": age, "gender": gender, "gender_label": gender_label}

    except Exception as e:
        logger.debug("Age/gender estimation error: %s", e)
        return None


AGE_GENDER_AVAILABLE = True
try:
    import insightface  # noqa: F401
except ImportError:
    AGE_GENDER_AVAILABLE = False
    logger.info("insightface not installed - age/gender estimation disabled")
