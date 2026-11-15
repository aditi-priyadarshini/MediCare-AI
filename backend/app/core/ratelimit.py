"""Sliding-window rate limiter behind a small interface (swap for Redis in Phase 3)."""

import threading
import time
from collections import deque

from fastapi import Request

from app.core.errors import AppError


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Record a hit. Returns (allowed, retry_after_seconds)."""
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and q[0] <= now - window_seconds:
                q.popleft()
            if len(q) >= limit:
                return False, max(1, int(window_seconds - (now - q[0])))
            q.append(now)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def client_ip(request: Request) -> str:
    # Behind a reverse proxy, configure uvicorn --proxy-headers with trusted forwarded IPs.
    return request.client.host if request.client else "unknown"


def enforce(request: Request, scope: str, ident: str, limit: int, window_seconds: int) -> None:
    if not request.app.state.settings.rate_limit_enabled:
        return
    allowed, retry_after = request.app.state.limiter.allow(
        f"{scope}:{ident}", limit, window_seconds
    )
    if not allowed:
        raise AppError(
            429,
            "RATE_LIMITED",
            "Too many attempts. Please wait and try again.",
            headers={"Retry-After": str(retry_after)},
        )


def rate_limit_ip(scope: str, limit: int, window_seconds: int):
    def dependency(request: Request) -> None:
        enforce(request, scope, client_ip(request), limit, window_seconds)

    return dependency
