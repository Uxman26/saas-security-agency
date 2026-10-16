"""Per-request API usage logging.

One row per authenticated request. Timing and status are recorded when available
so Super Admin monitoring can report measured latency and error rates.

The DB write runs in a worker thread so the event loop is not blocked.
"""

import time

from jose import JWTError, jwt
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings
from app.database import SessionLocal
from app.models import ApiUsageLog, User

_COMPANY_CACHE: dict[int, tuple[int | None, float]] = {}
_COMPANY_CACHE_TTL = 60.0
_COMPANY_CACHE_MAX = 2048


def _company_id_for(db, user_id: int) -> int | None:
    now = time.monotonic()
    hit = _COMPANY_CACHE.get(user_id)
    if hit and now - hit[1] < _COMPANY_CACHE_TTL:
        return hit[0]
    row = db.query(User.company_id).filter(User.id == user_id).first()
    company_id = row[0] if row else None
    if len(_COMPANY_CACHE) >= _COMPANY_CACHE_MAX:
        _COMPANY_CACHE.clear()
    _COMPANY_CACHE[user_id] = (company_id, now)
    return company_id


def _record(
    user_id: int,
    path: str,
    method: str,
    status_code: int | None,
    duration_ms: int | None,
) -> None:
    db = SessionLocal()
    try:
        company_id = _company_id_for(db, user_id)
        if company_id:
            db.add(
                ApiUsageLog(
                    company_id=company_id,
                    path=path,
                    method=method,
                    status_code=status_code,
                    duration_ms=duration_ms,
                )
            )
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


class ApiUsageMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - started) * 1000)
        if request.method == "OPTIONS" or request.url.path == "/" or request.url.path.startswith("/swagger"):
            return response
        # Skip high-frequency monitoring polls to avoid feedback loops.
        if request.url.path.startswith("/admin/server-monitor"):
            return response
        auth = request.headers.get("authorization") or ""
        if not auth.lower().startswith("bearer "):
            return response
        token = auth.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
            uid = int(payload.get("sub"))
        except (JWTError, TypeError, ValueError):
            return response
        await run_in_threadpool(
            _record,
            uid,
            request.url.path[:200],
            request.method,
            int(response.status_code),
            duration_ms,
        )
        return response
