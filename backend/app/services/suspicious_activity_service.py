from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import LoginLog, SecurityEvent, User
from app.services.admin_platform_ext_service import record_security_event


def _now():
    return datetime.now(timezone.utc)


def scan_suspicious_activity(db: Session) -> list[dict]:
    """Detect simple high-signal patterns and persist new security events."""
    window = _now() - timedelta(hours=1)
    findings: list[dict] = []

    # Burst failed logins per email
    failed = (
        db.query(LoginLog.email, func.count(LoginLog.id))
        .filter(LoginLog.status == "failed", LoginLog.login_at >= window)
        .group_by(LoginLog.email)
        .having(func.count(LoginLog.id) >= 8)
        .all()
    )
    for email, count in failed:
        msg = f"Suspicious: {count} failed logins for {email} in 1h"
        existing = (
            db.query(SecurityEvent)
            .filter(
                SecurityEvent.event_type == "suspicious.login_burst",
                SecurityEvent.message == msg,
                SecurityEvent.created_at >= window,
            )
            .first()
        )
        if not existing:
            u = db.query(User).filter(User.email == email).first() if email else None
            ev = record_security_event(
                db,
                event_type="suspicious.login_burst",
                message=msg,
                severity="high",
                company_id=u.company_id if u else None,
                user_id=u.id if u else None,
            )
            findings.append({"id": ev.id, "event_type": ev.event_type, "message": msg, "severity": "high"})

    # Burst failed logins per IP
    by_ip = (
        db.query(LoginLog.ip_address, func.count(LoginLog.id))
        .filter(LoginLog.status == "failed", LoginLog.login_at >= window, LoginLog.ip_address.isnot(None))
        .group_by(LoginLog.ip_address)
        .having(func.count(LoginLog.id) >= 15)
        .all()
    )
    for ip, count in by_ip:
        msg = f"Suspicious: {count} failed logins from IP {ip} in 1h"
        existing = (
            db.query(SecurityEvent)
            .filter(
                SecurityEvent.event_type == "suspicious.ip_burst",
                SecurityEvent.message == msg,
                SecurityEvent.created_at >= window,
            )
            .first()
        )
        if not existing:
            ev = record_security_event(
                db,
                event_type="suspicious.ip_burst",
                message=msg,
                severity="high",
                ip_address=ip,
            )
            findings.append({"id": ev.id, "event_type": ev.event_type, "message": msg, "severity": "high"})

    return findings


def list_suspicious(db: Session, limit: int = 100) -> list[dict]:
    rows = (
        db.query(SecurityEvent)
        .filter(SecurityEvent.event_type.like("suspicious.%"))
        .order_by(SecurityEvent.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "event_type": r.event_type,
            "severity": r.severity,
            "message": r.message,
            "ip_address": r.ip_address,
            "company_id": r.company_id,
            "user_id": r.user_id,
            "created_at": r.created_at,
        }
        for r in rows
    ]
