import os
import threading
import time
from collections import defaultdict
from pathlib import Path

_lock = threading.Lock()
_started_at = time.time()
_request_count = defaultdict(int)
_status_count = defaultdict(int)
_total_latency = defaultdict(float)


def record_request(method: str, path: str, status_code: int, latency_seconds: float) -> None:
    route = path.split("?")[0]
    key = (method, route)
    with _lock:
        _request_count[key] += 1
        _status_count[status_code] += 1
        _total_latency[key] += latency_seconds


def render_prometheus_metrics() -> str:
    lines = [
        "# HELP face_analytics_uptime_seconds Process uptime in seconds",
        "# TYPE face_analytics_uptime_seconds gauge",
        f"face_analytics_uptime_seconds {time.time() - _started_at:.3f}",
        "# HELP face_analytics_requests_total HTTP request count",
        "# TYPE face_analytics_requests_total counter",
    ]

    with _lock:
        for (method, route), count in sorted(_request_count.items()):
            lines.append(
                f'face_analytics_requests_total{{method="{method}",route="{route}"}} {count}'
            )

        lines.extend([
            "# HELP face_analytics_responses_total HTTP response count by status",
            "# TYPE face_analytics_responses_total counter",
        ])
        for status, count in sorted(_status_count.items()):
            lines.append(f'face_analytics_responses_total{{status="{status}"}} {count}')

        lines.extend([
            "# HELP face_analytics_request_latency_seconds_total Total request latency seconds",
            "# TYPE face_analytics_request_latency_seconds_total counter",
        ])
        for (method, route), total in sorted(_total_latency.items()):
            lines.append(
                f'face_analytics_request_latency_seconds_total{{method="{method}",route="{route}"}} {total:.6f}'
            )

    try:
        from app.operations import media_storage_status

        backend_dir = Path(__file__).resolve().parents[1]
        media_dir = os.getenv("MEDIA_DIR", str(backend_dir / "media"))
        storage = media_storage_status(media_dir)
        lines.extend([
            "# HELP face_analytics_media_bytes Media directory size in bytes",
            "# TYPE face_analytics_media_bytes gauge",
            f"face_analytics_media_bytes {storage['media_bytes']}",
            "# HELP face_analytics_disk_free_bytes Free bytes on the media filesystem",
            "# TYPE face_analytics_disk_free_bytes gauge",
            f"face_analytics_disk_free_bytes {storage['disk_free_bytes']}",
            "# HELP face_analytics_media_storage_ok Media storage threshold status",
            "# TYPE face_analytics_media_storage_ok gauge",
            f"face_analytics_media_storage_ok {1 if storage['ok'] else 0}",
        ])
    except Exception:
        pass

    try:
        from app.camera_pool import camera_pool

        camera_status = camera_pool.status()
        connected = sum(1 for status in camera_status.values() if status["connected"])
        lines.extend([
            "# HELP face_analytics_camera_workers Camera worker count",
            "# TYPE face_analytics_camera_workers gauge",
            f"face_analytics_camera_workers {len(camera_status)}",
            "# HELP face_analytics_cameras_connected Connected camera worker count",
            "# TYPE face_analytics_cameras_connected gauge",
            f"face_analytics_cameras_connected {connected}",
        ])
    except Exception:
        pass

    return "\n".join(lines) + "\n"
