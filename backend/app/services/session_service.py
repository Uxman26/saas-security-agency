"""Server-side session lifecycle.

An access token is only a pointer: its `jti` names a row in ``user_sessions``, and that
row is what actually decides whether the caller is signed in. That makes three things
possible that a bare JWT cannot do — logout that takes effect everywhere, an idle
timeout, and cutting every session when a password changes.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models import UserSession


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; treat those as UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def new_jti() -> str:
    return uuid.uuid4().hex


def idle_timeout_minutes(remember_me: bool) -> int:
    if remember_me:
        return settings.session_remember_idle_days * 24 * 60
    return settings.session_idle_timeout_minutes


def create_session(
    db: Session,
    user_id: int,
    jti: str,
    *,
    expires_at: datetime,
    remember_me: bool = False,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> UserSession:
    row = UserSession(
        user_id=user_id,
        jti=jti,
        last_seen_at=_now(),
        expires_at=expires_at,
        idle_timeout_minutes=idle_timeout_minutes(remember_me),
        ip_address=ip_address,
        user_agent=(user_agent or "")[:500] or None,
    )
    db.add(row)
    db.commit()
    return row


def active_session(db: Session, jti: str) -> UserSession | None:
    """The live session for this token, or None if it is revoked, expired or idle out.

    Deliberately returns None rather than raising so the caller can answer with the
    same generic 401 it uses for a malformed token — an attacker learns nothing about
    why the token failed.
    """
    if not jti:
        return None
    row = db.query(UserSession).filter(UserSession.jti == jti).first()
    if row is None or row.revoked_at is not None:
        return None
    now = _now()
    if (expires := _aware(row.expires_at)) and expires <= now:
        return None
    last_seen = _aware(row.last_seen_at) or _aware(row.created_at)
    window = row.idle_timeout_minutes or settings.session_idle_timeout_minutes
    if last_seen and last_seen < now - timedelta(minutes=window):
        return None
    return row


def touch(db: Session, row: UserSession) -> None:
    """Push the idle window forward, writing at most once per touch interval."""
    now = _now()
    last_seen = _aware(row.last_seen_at)
    if last_seen and (now - last_seen).total_seconds() < settings.session_touch_interval_seconds:
        return
    row.last_seen_at = now
    db.commit()


def revoke(db: Session, jti: str) -> bool:
    row = db.query(UserSession).filter(UserSession.jti == jti, UserSession.revoked_at.is_(None)).first()
    if row is None:
        return False
    row.revoked_at = _now()
    db.commit()
    return True


def revoke_all_for_user(db: Session, user_id: int, *, except_jti: str | None = None) -> int:
    """Kill every session for a user. Used on password change and 'sign out everywhere'."""
    q = db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.revoked_at.is_(None),
    )
    if except_jti:
        q = q.filter(UserSession.jti != except_jti)
    rows = q.all()
    now = _now()
    for row in rows:
        row.revoked_at = now
    if rows:
        db.commit()
    return len(rows)


def purge_expired(db: Session, *, older_than_days: int = 30) -> int:
    """Drop rows that can never authenticate again, so the table stays small."""
    cutoff = _now() - timedelta(days=older_than_days)
    deleted = (
        db.query(UserSession)
        .filter(
            or_(
                UserSession.expires_at < cutoff,
                UserSession.revoked_at < cutoff,
            )
        )
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()
    return deleted
