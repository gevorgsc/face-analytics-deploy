import json
import logging
import os
import sys
import traceback


class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON line for log aggregators."""

    def format(self, record: logging.LogRecord) -> str:
        obj: dict = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            obj["exc"] = traceback.format_exception(*record.exc_info)[-1].strip()
        if record.stack_info:
            obj["stack"] = self.formatStack(record.stack_info)
        return json.dumps(obj, ensure_ascii=False)


def configure_logging() -> None:
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    use_json = os.getenv("LOG_JSON", "0").strip().lower() in {"1", "true", "yes", "on"}

    handler = logging.StreamHandler(sys.stdout)
    if use_json:
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
        )

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()
    root.addHandler(handler)
