import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Callable, Any


_executor = ThreadPoolExecutor(max_workers=2)
_lock = threading.Lock()
_jobs: dict[str, dict] = {}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def submit_job(kind: str, fn: Callable[..., Any], *args, **kwargs) -> str:
    job_id = uuid.uuid4().hex
    with _lock:
        _jobs[job_id] = {
            "id": job_id,
            "kind": kind,
            "status": "queued",
            "created_at": utc_now_iso(),
            "started_at": None,
            "finished_at": None,
            "error": None,
            "result": None,
        }

    def runner():
        with _lock:
            _jobs[job_id]["status"] = "running"
            _jobs[job_id]["started_at"] = utc_now_iso()
        try:
            result = fn(*args, **kwargs)
            with _lock:
                _jobs[job_id]["status"] = "completed"
                _jobs[job_id]["result"] = result
        except Exception as e:
            with _lock:
                _jobs[job_id]["status"] = "failed"
                _jobs[job_id]["error"] = f"{e.__class__.__name__}: {e}"
        finally:
            with _lock:
                _jobs[job_id]["finished_at"] = utc_now_iso()

    _executor.submit(runner)
    return job_id


def get_job(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def list_jobs(limit: int = 100) -> list[dict]:
    with _lock:
        jobs = list(_jobs.values())
    jobs.sort(key=lambda j: j["created_at"], reverse=True)
    return [dict(job) for job in jobs[:limit]]
