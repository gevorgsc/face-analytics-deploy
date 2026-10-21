import json
import logging
import threading
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

_MAX_K = 500

try:
    import faiss
    FAISS_AVAILABLE = True
except Exception as e:
    faiss = None
    FAISS_AVAILABLE = False
    logger.warning("FAISS not available. Falling back to linear search: %s", e)


_lock = threading.Lock()

_registered_index = None
_registered_ids = []

_unknown_index = None
_unknown_ids = []

_dirty = True


def normalize_embedding(embedding) -> np.ndarray:
    arr = np.asarray(embedding, dtype="float32")

    if arr.ndim == 1:
        arr = arr.reshape(1, -1)

    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    norms[norms == 0] = 1.0

    return arr / norms


def mark_faiss_dirty():
    global _dirty
    with _lock:
        _dirty = True


def _build_index(vectors: list):
    if not FAISS_AVAILABLE or not vectors:
        return None

    matrix = normalize_embedding(np.vstack(vectors).astype("float32"))

    index = faiss.IndexFlatIP(matrix.shape[1])
    index.add(matrix)

    return index


def rebuild_faiss_indexes(db, Person):
    """
    Rebuilds FAISS indexes from PostgreSQL persons table.
    Safe to call many times. Runs only when dirty.
    """
    global _registered_index, _registered_ids, _unknown_index, _unknown_ids, _dirty

    if not FAISS_AVAILABLE:
        return False

    with _lock:
        if not _dirty:
            return True

        registered_vectors = []
        registered_ids = []

        unknown_vectors = []
        unknown_ids = []

        persons = db.query(Person).filter(Person.face_embedding.isnot(None)).all()

        for person in persons:
            try:
                embedding = np.asarray(json.loads(person.face_embedding), dtype="float32")

                if person.person_type == "unknown":
                    unknown_vectors.append(embedding)
                    unknown_ids.append(person.id)
                else:
                    registered_vectors.append(embedding)
                    registered_ids.append(person.id)

            except Exception:
                continue

        _registered_index = _build_index(registered_vectors)
        _registered_ids = registered_ids

        _unknown_index = _build_index(unknown_vectors)
        _unknown_ids = unknown_ids

        _dirty = False

        logger.info(
            "FAISS indexes rebuilt: registered=%d, unknown=%d",
            len(_registered_ids), len(_unknown_ids),
        )

        return True


def search_registered_person(db, Person, embedding, threshold: float) -> Tuple[Optional[object], float]:
    """
    Returns best registered person using FAISS.
    If FAISS is unavailable or index is empty, returns (None, 0.0).
    """
    if not FAISS_AVAILABLE:
        return None, 0.0

    rebuild_faiss_indexes(db, Person)

    with _lock:
        if _registered_index is None or not _registered_ids:
            return None, 0.0

        query = normalize_embedding(embedding)
        scores, indexes = _registered_index.search(query, 1)

        score = float(scores[0][0])
        idx = int(indexes[0][0])

        if idx < 0 or score < threshold:
            return None, score

        person_id = _registered_ids[idx]

    person = db.query(Person).filter(Person.id == person_id).first()
    if person is None:
        return None, 0.0
    return person, score


def search_unknown_group(db, Person, embedding, threshold: float) -> Tuple[Optional[object], float]:
    """
    Returns best unknown person/group using FAISS.
    If FAISS is unavailable or index is empty, returns (None, 0.0).
    """
    if not FAISS_AVAILABLE:
        return None, 0.0

    rebuild_faiss_indexes(db, Person)

    with _lock:
        if _unknown_index is None or not _unknown_ids:
            return None, 0.0

        query = normalize_embedding(embedding)
        scores, indexes = _unknown_index.search(query, 1)

        score = float(scores[0][0])
        idx = int(indexes[0][0])

        if idx < 0 or score < threshold:
            return None, score

        person_id = _unknown_ids[idx]

    person = db.query(Person).filter(Person.id == person_id).first()
    if person is None:
        return None, 0.0
    return person, score


def search_all_persons_topk(
    db, Person, embedding, threshold: float, k: int = 50
) -> list:
    k = min(k, _MAX_K)
    """
    Top-k FAISS search across ALL persons (registered + unknown).
    Returns list of (person_id, score) pairs above threshold, sorted desc.
    Falls back to empty list if FAISS unavailable.
    """
    if not FAISS_AVAILABLE:
        return []

    rebuild_faiss_indexes(db, Person)

    results = []

    with _lock:
        for index, ids in [(_registered_index, _registered_ids), (_unknown_index, _unknown_ids)]:
            if index is None or not ids:
                continue
            query = normalize_embedding(embedding)
            actual_k = min(k, index.ntotal)
            if actual_k == 0:
                continue
            scores, indexes = index.search(query, actual_k)
            for score, idx in zip(scores[0], indexes[0]):
                if idx < 0 or float(score) < threshold:
                    continue
                results.append((ids[idx], float(score)))

    results.sort(key=lambda x: x[1], reverse=True)
    return results[:k]
