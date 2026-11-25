import re
import time
from collections import defaultdict, deque
from functools import wraps
from threading import Lock

from flask import current_app, request

from app.utils.responses import err

_events: dict[tuple, deque] = defaultdict(deque)
_lock = Lock()


def _client_key() -> str:
    # Prefer proxy-supplied address only when explicitly trusted.
    if current_app.config.get("TRUST_PROXY_HEADERS"):
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def check_rate_limit(limit: int, window: int, name: str = ""):
    """Return a 429 response tuple when the caller exceeded the window, else None."""
    key = (name or request.endpoint, _client_key())
    now = time.monotonic()
    with _lock:
        bucket = _events[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            retry = max(1, int(window - (now - bucket[0])))
            response, status = err(
                "Too many requests. Please slow down and try again shortly.",
                429,
                "rate_limited",
                {"retry_after_seconds": retry},
            )
            response.headers["Retry-After"] = str(retry)
            return response, status
        bucket.append(now)
    return None


def rate_limit(limit: int, window: int, name: str = ""):
    """Simple in-memory fixed-window limiter suitable for a single instance demo."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            limited = check_rate_limit(limit, window, name)
            if limited is not None:
                return limited
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def reset_limits() -> None:
    with _lock:
        _events.clear()
