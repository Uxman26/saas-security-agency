import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_LOCK = threading.Lock()
_BUCKETS: dict[tuple[str, str], deque] = defaultdict(deque)


def reset_for_tests() -> None:
    with _LOCK:
        _BUCKETS.clear()


def enforce_public_rate(
    request: Request,
    *,
    key: str,
    limit: int,
    window_seconds: int = 60,
) -> None:
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    bucket_key = (key, ip)
    with _LOCK:
        q = _BUCKETS[bucket_key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait and try again.",
            )
        q.append(now)
