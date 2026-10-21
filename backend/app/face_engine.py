import logging
import os
import cv2
import numpy as np
from insightface.app import FaceAnalysis
from app.env import load_app_env

load_app_env()
logger = logging.getLogger(__name__)

INSIGHTFACE_MODEL   = os.getenv("INSIGHTFACE_MODEL", "buffalo_l")
INSIGHTFACE_CTX_ID  = int(os.getenv("INSIGHTFACE_CTX_ID", "-1"))
INSIGHTFACE_DET_SIZE = int(os.getenv("INSIGHTFACE_DET_SIZE", "640"))

# C) Explicit module list — ensures genderage is always loaded
face_app = FaceAnalysis(
    name=INSIGHTFACE_MODEL,
    allowed_modules=["detection", "recognition", "genderage"],
)

try:
    face_app.prepare(
        ctx_id=INSIGHTFACE_CTX_ID,
        det_size=(INSIGHTFACE_DET_SIZE, INSIGHTFACE_DET_SIZE),
        det_thresh=0.35,   # C) lower threshold — catches smaller/angled faces
    )
except Exception as e:
    if INSIGHTFACE_CTX_ID != -1:
        logger.warning("CUDA failed, fallback to CPU: %s", e)
        face_app.prepare(ctx_id=-1, det_size=(INSIGHTFACE_DET_SIZE, INSIGHTFACE_DET_SIZE), det_thresh=0.35)
    else:
        raise


# A) Enhanced face crop for better age/gender accuracy
def _enhanced_crop(img: np.ndarray, bbox, target: int = 224) -> np.ndarray | None:
    """Crop face + 40% padding, resize to target px — more context for genderage model."""
    h, w = img.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    fw, fh = x2 - x1, y2 - y1
    if fw < 20 or fh < 20:
        return None
    px = int(fw * 0.40)
    py = int(fh * 0.40)
    x1c = max(0, x1 - px)
    y1c = max(0, y1 - py)
    x2c = min(w, x2 + px)
    y2c = min(h, y2 + py)
    crop = img[y1c:y2c, x1c:x2c]
    if crop.size == 0:
        return None
    return cv2.resize(crop, (target, target), interpolation=cv2.INTER_LINEAR)


def extract_faces(image_path: str):
    img = cv2.imread(image_path)
    if img is None:
        return []

    faces = face_app.get(img)
    results = []

    for face in faces:
        age        = int(getattr(face, "age", 0) or 0)
        gender_raw = getattr(face, "gender", None)

        # A) Re-run genderage on padded face crop for higher accuracy
        if face.bbox is not None:
            crop = _enhanced_crop(img, face.bbox)
            if crop is not None:
                try:
                    re_faces = face_app.get(crop)
                    if re_faces:
                        rf = re_faces[0]
                        rf_age    = int(getattr(rf, "age", 0) or 0)
                        rf_gender = getattr(rf, "gender", None)
                        # Accept re-estimate only if it found the face clearly
                        if rf_age > 0 and float(rf.det_score) > 0.6:
                            age = rf_age
                        if rf_gender is not None and float(rf.det_score) > 0.6:
                            gender_raw = rf_gender
                except Exception as _re:
                    logger.debug("Gender/age re-estimation failed: %s", _re)

        gender_label = None
        if gender_raw is not None:
            gender_label = "Male" if int(gender_raw) == 1 else "Female"

        results.append({
            "embedding": face.embedding,
            "bbox": face.bbox.tolist(),
            "det_score": float(face.det_score),
            "age":    age if age > 0 else None,
            "gender": gender_label,
        })

    return results


def compare_embeddings(emb1, emb2) -> float:
    emb1 = np.array(emb1, dtype="float32")
    emb2 = np.array(emb2, dtype="float32")
    norm1 = np.linalg.norm(emb1)
    norm2 = np.linalg.norm(emb2)
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return float(np.dot(emb1, emb2) / (norm1 * norm2))
