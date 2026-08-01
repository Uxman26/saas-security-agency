"""Brute-force throttling for the login endpoint.

Reads the ``login_logs`` rows that were already being written on every attempt but
never consulted, so this needs no new table and no Redis. Two independent counters:

* **per account** — stops someone grinding one mailbox's password;
* **per IP** — stops one host spraying many accounts, which the account counter alone
  would never notice.

Both are evaluated inside a rolling window, and a trip locks that key out for
``login_lockout_minutes``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import LoginLog

FAILED = "failed"


def _window_start() -> datetime:
    return datetime.now(timezone.utc) - timedelta(minutes=settings.login_attempt_window_minutes)


def _failed_attempts(db: Session, *, email: str | None = None, ip_address: str | None = None) -> int:
    q = db.query(func.count(LoginLog.id)).filter(
        LoginLog.status == FAILED,
        LoginLog.login_at >= _window_start(),
    )
    if email is not None:
        q = q.filter(func.lower(LoginLog.email) == email.lower())
    if ip_address is not None:
        q = q.filter(LoginLog.ip_address == ip_address)
    return int(q.scalar() or 0)


def _last_failure_at(db: Session, *, email: str | None = None, ip_address: str | None = None) -> datetime | None:
    q = db.query(func.max(LoginLog.login_at)).filter(LoginLog.status == FAILED)
    if email is not None:
        q = q.filter(func.lower(LoginLog.email) == email.lower())
    if ip_address is not None:
        q = q.filter(LoginLog.ip_address == ip_address)
    value = q.scalar()
    if value is not None and value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value


def _locked_for(db: Session, *, email: str | None = None, ip_address: str | None = None, limit: int) -> int:
    """Seconds of lockout remaining for this key, 0 when not locked.

    A successful login is not counted, and only attempts inside the window are, so a
    genuine user who eventually gets it right is never held back afterwards.
    """
    if _failed_attempts(db, email=email, ip_address=ip_address) < limit:
        return 0
    last = _last_failure_at(db, email=email, ip_address=ip_address)
    if last is None:
        return 0
    unlock_at = last + timedelta(minutes=settings.login_lockout_minutes)
    remaining = (unlock_at - datetime.now(timezone.utc)).total_seconds()
    return max(0, int(remaining))


def assert_login_allowed(db: Session, email: str, ip_address: str | None) -> None:
    """Raise 429 when this account or IP has failed too often lately.

    Called before the password is checked, so a locked-out caller costs us one COUNT
    instead of a bcrypt verification.
    """
    retry_after = _locked_for(
        db, email=email, limit=settings.login_max_attempts_per_account
    )
    if not retry_after and ip_address:
        retry_after = _locked_for(
            db, ip_address=ip_address, limit=settings.login_max_attempts_per_ip
        )
    if retry_after:
        minutes = max(1, round(retry_after / 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed sign-in attempts. Try again in about {minutes} minute(s).",
            headers={"Retry-After": str(retry_after)},
        )
