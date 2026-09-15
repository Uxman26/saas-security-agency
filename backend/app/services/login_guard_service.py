from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import LoginLog, User

FAILED = "failed"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _window_start() -> datetime:
    return _now() - timedelta(minutes=settings.login_attempt_window_minutes)


def _ip_failed_attempts(db: Session, ip_address: str) -> int:
    return int(
        db.query(func.count(LoginLog.id))
        .filter(
            LoginLog.status == FAILED,
            LoginLog.ip_address == ip_address,
            LoginLog.login_at >= _window_start(),
        )
        .scalar()
        or 0
    )


def _ip_last_failure_at(db: Session, ip_address: str) -> datetime | None:
    value = (
        db.query(func.max(LoginLog.login_at))
        .filter(LoginLog.status == FAILED, LoginLog.ip_address == ip_address)
        .scalar()
    )
    return _aware(value)


def _ip_retry_after(db: Session, ip_address: str | None) -> int:
    if not ip_address:
        return 0
    if _ip_failed_attempts(db, ip_address) < settings.login_max_attempts_per_ip:
        return 0
    last = _ip_last_failure_at(db, ip_address)
    if last is None:
        return 0
    unlock_at = last + timedelta(minutes=settings.login_lockout_minutes)
    return max(0, int((unlock_at - _now()).total_seconds()))


def lockout_remaining_seconds(user: User | None) -> int:
    if not user:
        return 0
    until = _aware(getattr(user, "lockout_until", None))
    if not until:
        return 0
    return max(0, int((until - _now()).total_seconds()))


def _raise_locked(retry_after: int, *, email: str | None = None) -> None:
    locked_until = (_now() + timedelta(seconds=retry_after)).isoformat()
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "account_locked",
            "message": "Too many failed sign-in attempts. Your account is temporarily locked.",
            "retry_after_seconds": retry_after,
            "locked_until": locked_until,
            "email": email,
        },
        headers={"Retry-After": str(retry_after)},
    )


def _raise_password_reset_required(email: str | None = None) -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "password_reset_required",
            "message": "Too many failed sign-in attempts. Reset your password to regain access.",
            "email": email,
        },
    )


def assert_login_allowed(db: Session, email: str, ip_address: str | None) -> None:
    user = db.query(User).filter(func.lower(User.email) == email.lower().strip()).first()
    if user and bool(getattr(user, "must_reset_password", False)):
        _raise_password_reset_required(user.email)

    retry_after = lockout_remaining_seconds(user)
    if retry_after:
        _raise_locked(retry_after, email=user.email if user else email)

    ip_retry = _ip_retry_after(db, ip_address)
    if ip_retry:
        _raise_locked(ip_retry, email=email)


def clear_login_failures(user: User) -> None:
    user.failed_login_count = 0
    user.lockout_until = None
    user.post_lockout_watch = False
    user.must_reset_password = False


def clear_lockout_state(user: User) -> None:
    user.failed_login_count = 0
    user.lockout_until = None
    user.post_lockout_watch = False
    user.must_reset_password = False


def record_failed_password_attempt(db: Session, user: User) -> None:
    if bool(getattr(user, "must_reset_password", False)):
        db.commit()
        _raise_password_reset_required(user.email)

    remaining = lockout_remaining_seconds(user)
    if remaining:
        db.commit()
        _raise_locked(remaining, email=user.email)

    if bool(getattr(user, "post_lockout_watch", False)):
        user.must_reset_password = True
        user.post_lockout_watch = False
        user.failed_login_count = 0
        user.lockout_until = None
        db.commit()
        try:
            from app.services.platform_mail_service import send_template_email

            send_template_email(
                db,
                key="login_security_alert",
                to_email=user.email,
                variables={
                    "full_name": user.full_name or user.email,
                    "email": user.email,
                    "company_name": "",
                    "action": "password reset required after repeated failed sign-in attempts",
                },
                company_id=user.company_id,
                user_id=user.id,
            )
        except Exception:
            pass
        _raise_password_reset_required(user.email)

    count = int(getattr(user, "failed_login_count", 0) or 0) + 1
    user.failed_login_count = count
    limit = settings.login_max_attempts_per_account
    if count >= limit:
        until = _now() + timedelta(minutes=settings.login_lockout_minutes)
        user.lockout_until = until
        user.post_lockout_watch = True
        user.failed_login_count = 0
        db.commit()
        try:
            from app.services.platform_mail_service import send_template_email

            mins = settings.login_lockout_minutes
            send_template_email(
                db,
                key="account_lockout",
                to_email=user.email,
                variables={
                    "full_name": user.full_name or user.email,
                    "email": user.email,
                    "company_name": "",
                    "lockout_minutes": mins,
                    "locked_until": until.isoformat(),
                },
                company_id=user.company_id,
                user_id=user.id,
            )
        except Exception:
            pass
        _raise_locked(settings.login_lockout_minutes * 60, email=user.email)

    db.commit()
