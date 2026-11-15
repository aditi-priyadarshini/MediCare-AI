"""Structured JSON logging with request IDs.

Policy: never log request/response bodies, query strings, passwords, OTPs, tokens,
report contents or chat messages. Log route templates and metadata only.
"""

import json
import logging
from contextvars import ContextVar
from datetime import UTC, datetime

request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)

_EXTRA_FIELDS = ("method", "path", "status", "duration_ms", "event")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_ctx.get(),
        }
        for field in _EXTRA_FIELDS:
            if hasattr(record, field):
                payload[field] = getattr(record, field)
        if record.exc_info and record.exc_info[0]:
            # Exception type only: messages/tracebacks can embed user data.
            payload["exc_type"] = record.exc_info[0].__name__
        return json.dumps(payload)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    # Uvicorn's access log includes query strings; we emit our own request log instead.
    logging.getLogger("uvicorn.access").disabled = True
