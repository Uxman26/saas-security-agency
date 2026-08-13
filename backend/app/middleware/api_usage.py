"""Per-request API usage logging.

One row per authenticated request, read back as counts by the usage reports. The
work itself is small, but it runs on every request, so how it is scheduled matters
more than what it does:

* The DB call is synchronous. Awaiting it directly on the event loop stalled every
  other in-flight request for its duration, which on a page issuing several parallel
  calls meant they queued rather than overlapped. It now runs in a worker thread.
* Resolving the caller's company re-queried ``users`` on every request. The mapping
  changes only when a user is moved between companies, so it is cached for a short
  TTL instead.

Behaviour is unchanged: still exactly one row per authenticated, non-OPTIONS request,
written before the response is returned.
"""

import time

from jose import JWTError, jwt
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings
from app.database import SessionLocal
from app.models import ApiUsageLog, User

# user id -> (company_id, cached_at). Short enough that a company move is picked up
# within a minute, long enough to take the query off the hot path.
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


def _record(user_id: int, path: str, method: str) -> None:
    db = SessionLocal()
    try:
        company_id = _company_id_for(db, user_id)
        if company_id:
            db.add(ApiUsageLog(company_id=company_id, path=path, method=method))
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


class ApiUsageMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.method == "OPTIONS" or request.url.path == "/" or request.url.path.startswith("/swagger"):
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
        await run_in_threadpool(_record, uid, request.url.path[:200], request.method)
        return response
