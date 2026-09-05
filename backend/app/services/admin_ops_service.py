from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.models import (
    ApiUsageLog,
    Company,
    EmailLog,
    ErrorLog,
    LoginLog,
    PlatformAuditLog,
    SecurityEvent,
    TemporaryAccessSession,
    User,
    UserSession,
)
from app.services import platform_audit_service
from app.services import session_service

TEMP_ACCESS_MINUTES = 10
IMPERSONATION_MINUTES = 30


def _now():
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def set_account_status(
    db: Session,
    company_id: int,
    status: str,
    *,
    actor: User,
    reason: Optional[str] = None,
    request: Optional[Request] = None,
) -> Company:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    before = {"account_status": getattr(co, "account_status", None), "subscription_status": co.subscription_status}
    co.account_status = status
    if status == "locked":
        co.locked_at = _now()
        co.locked_reason = reason
    elif status in ("active", "unlocked"):
        co.account_status = "active"
        co.locked_at = None
        co.locked_reason = None
    elif status == "suspended":
        co.subscription_status = "suspended"
    elif status == "deactivated":
        co.subscription_status = "cancelled"
        for u in db.query(User).filter(User.company_id == co.id).all():
            if u.role != "super_admin":
                u.is_active = False
    db.commit()
    db.refresh(co)
    platform_audit_service.log(
        db,
        actor=actor,
        action=f"company.{status}",
        target_type="company",
        target_id=co.id,
        target_label=co.name,
        company=co,
        before=before,
        after={"account_status": co.account_status, "subscription_status": co.subscription_status},
        note=reason,
        request=request,
    )
    return co


def grant_temporary_access(
    db: Session,
    company_id: int,
    *,
    actor: User,
    reason: str,
    request: Optional[Request] = None,
) -> dict[str, Any]:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    if not reason or len(reason.strip()) < 5:
        raise HTTPException(status_code=400, detail="Reason required (min 5 characters)")
    token = secrets.token_hex(24)
    expires = _now() + timedelta(minutes=TEMP_ACCESS_MINUTES)
    row = TemporaryAccessSession(
        company_id=co.id,
        granted_by_user_id=actor.id,
        reason=reason.strip(),
        token=token,
        expires_at=expires,
    )
    prev_status = getattr(co, "account_status", None) or "active"
    if prev_status == "locked":
        co.account_status = "active"
        co.locked_at = None
        co.locked_reason = None
    db.add(row)
    db.commit()
    db.refresh(row)
    platform_audit_service.log(
        db,
        actor=actor,
        action="company.temp_access_granted",
        target_type="company",
        target_id=co.id,
        target_label=co.name,
        company=co,
        after={"expires_at": expires.isoformat(), "minutes": TEMP_ACCESS_MINUTES},
        note=reason,
        request=request,
    )
    return {
        "id": row.id,
        "company_id": co.id,
        "company_name": co.name,
        "token": token,
        "expires_at": expires,
        "minutes": TEMP_ACCESS_MINUTES,
        "reason": reason,
    }


def list_temp_access(db: Session, company_id: Optional[int] = None) -> list[dict]:
    q = db.query(TemporaryAccessSession).options(joinedload(TemporaryAccessSession.company))
    if company_id:
        q = q.filter(TemporaryAccessSession.company_id == company_id)
    rows = q.order_by(TemporaryAccessSession.id.desc()).limit(100).all()
    now = _now()
    out = []
    for r in rows:
        exp = _aware(r.expires_at)
        active = r.revoked_at is None and exp and exp > now
        out.append(
            {
                "id": r.id,
                "company_id": r.company_id,
                "company_name": r.company.name if r.company else None,
                "granted_by_user_id": r.granted_by_user_id,
                "reason": r.reason,
                "expires_at": r.expires_at,
                "revoked_at": r.revoked_at,
                "is_active": bool(active),
                "created_at": r.created_at,
            }
        )
    return out


def revoke_temp_access(db: Session, session_id: int, actor: User, request: Optional[Request] = None) -> dict:
    row = db.query(TemporaryAccessSession).filter(TemporaryAccessSession.id == session_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    row.revoked_at = _now()
    db.commit()
    platform_audit_service.log(
        db,
        actor=actor,
        action="company.temp_access_revoked",
        target_type="temp_access",
        target_id=row.id,
        company_id=row.company_id,
        request=request,
    )
    return {"id": row.id, "revoked_at": row.revoked_at}


def start_impersonation(
    db: Session,
    *,
    actor: User,
    target_user_id: int,
    parent_jti: str,
    reason: str,
    mode: str = "support",
    request: Optional[Request] = None,
) -> dict[str, Any]:
    from app.auth import create_access_token

    if not reason or len(reason.strip()) < 5:
        raise HTTPException(status_code=400, detail="Reason required")
    target = db.query(User).filter(User.id == target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == "super_admin":
        raise HTTPException(status_code=400, detail="Cannot impersonate super admin")
    parent = session_service.active_session(db, parent_jti)
    if not parent or parent.user_id != actor.id:
        raise HTTPException(status_code=401, detail="Invalid parent session")
    jti = session_service.new_jti()
    expires = _now() + timedelta(minutes=IMPERSONATION_MINUTES)
    ip, ua = platform_audit_service.request_meta(request)
    row = UserSession(
        user_id=target.id,
        jti=jti,
        last_seen_at=_now(),
        expires_at=expires,
        idle_timeout_minutes=IMPERSONATION_MINUTES,
        ip_address=ip,
        user_agent=(ua or "")[:500] or None,
        impersonator_user_id=actor.id,
        parent_jti=parent_jti,
        impersonation_mode=mode,
        impersonation_reason=reason.strip(),
    )
    db.add(row)
    db.commit()
    token = create_access_token(
        data={"sub": target.id, "jti": jti},
        expires_delta=timedelta(minutes=IMPERSONATION_MINUTES),
    )
    platform_audit_service.log(
        db,
        actor=actor,
        action="impersonation.start",
        target_type="user",
        target_id=target.id,
        target_label=target.email,
        company_id=target.company_id,
        after={"mode": mode, "expires_at": expires.isoformat()},
        note=reason,
        request=request,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires,
        "target_user_id": target.id,
        "target_email": target.email,
        "target_name": target.full_name,
        "company_id": target.company_id,
        "mode": mode,
    }


def end_impersonation(db: Session, *, jti: str, actor: User, request: Optional[Request] = None) -> dict:
    row = db.query(UserSession).filter(UserSession.jti == jti).first()
    if not row or row.impersonator_user_id != actor.id:
        raise HTTPException(status_code=400, detail="Not an impersonation session")
    session_service.revoke(db, jti)
    platform_audit_service.log(
        db,
        actor=actor,
        action="impersonation.end",
        target_type="user",
        target_id=row.user_id,
        company_id=None,
        request=request,
    )
    return {"ended": True, "parent_jti": row.parent_jti}


def tenant_support_view(db: Session, company_id: int) -> dict[str, Any]:
    from app.services import support_ticket_service
    from app.services.admin_platform_service import company_admin_out
    from app.services.tenant_usage_service import company_usage

    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    admin = db.query(User).filter(User.id == co.admin_id).first()
    users = db.query(User).filter(User.company_id == co.id).order_by(User.id).all()
    admins = [u for u in users if (u.role or "").lower() in ("admin", "company_admin") or u.id == co.admin_id]
    logins = (
        db.query(LoginLog)
        .filter(LoginLog.company_id == co.id)
        .order_by(LoginLog.id.desc())
        .limit(20)
        .all()
    )
    security = (
        db.query(SecurityEvent)
        .filter(SecurityEvent.company_id == co.id)
        .order_by(SecurityEvent.id.desc())
        .limit(20)
        .all()
    )
    audit = (
        db.query(PlatformAuditLog)
        .filter(PlatformAuditLog.company_id == co.id)
        .order_by(PlatformAuditLog.id.desc())
        .limit(20)
        .all()
    )
    errors = (
        db.query(ErrorLog)
        .filter(ErrorLog.company_id == co.id)
        .order_by(ErrorLog.last_seen_at.desc())
        .limit(20)
        .all()
    )
    tickets = support_ticket_service.list_tickets(db, company_id=co.id, limit=20)
    emails = db.query(EmailLog).filter(EmailLog.company_id == co.id).order_by(EmailLog.id.desc()).limit(10).all()
    api_count = db.query(ApiUsageLog).filter(ApiUsageLog.company_id == co.id).count()
    base = company_admin_out(db, co)
    return {
        **base,
        "email": co.email,
        "phone": co.phone,
        "address": co.address,
        "postcode": co.postcode,
        "website": co.website,
        "registration_number": co.registration_number,
        "vat_number": co.vat_number,
        "account_status": getattr(co, "account_status", None) or "active",
        "locked_at": getattr(co, "locked_at", None),
        "locked_reason": getattr(co, "locked_reason", None),
        "archived_at": getattr(co, "archived_at", None),
        "primary_contact": {
            "id": admin.id if admin else None,
            "email": admin.email if admin else None,
            "full_name": admin.full_name if admin else None,
            "is_active": admin.is_active if admin else None,
        },
        "administrators": [
            {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active}
            for u in admins
        ],
        "users": [
            {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active}
            for u in users
        ],
        "login_history": [
            {
                "id": r.id,
                "email": r.email,
                "login_at": r.login_at,
                "ip_address": r.ip_address,
                "status": r.status,
            }
            for r in logins
        ],
        "security_events": [
            {
                "id": r.id,
                "event_type": r.event_type,
                "severity": r.severity,
                "message": r.message,
                "created_at": r.created_at,
            }
            for r in security
        ],
        "recent_activities": [
            {
                "id": r.id,
                "action": r.action,
                "actor_email": r.actor_email,
                "target_label": r.target_label,
                "created_at": r.created_at,
            }
            for r in audit
        ],
        "support_tickets": tickets,
        "recent_errors": [
            {
                "id": r.id,
                "severity": r.severity,
                "message": r.message,
                "status": r.status,
                "last_seen_at": r.last_seen_at,
                "occurrence_count": r.occurrence_count,
            }
            for r in errors
        ],
        "email_logs": [
            {"id": r.id, "recipient": r.recipient, "subject": r.subject, "status": r.status, "sent_at": r.sent_at}
            for r in emails
        ],
        "usage": company_usage(db, co.id),
        "api_request_count": api_count,
    }


def list_active_sessions(db: Session, *, company_id: Optional[int] = None, limit: int = 200) -> list[dict]:
    now = _now()
    q = db.query(UserSession).options(joinedload(UserSession.user)).filter(UserSession.revoked_at.is_(None))
    rows = q.order_by(UserSession.last_seen_at.desc()).limit(limit * 3).all()
    out = []
    for r in rows:
        if _aware(r.expires_at) and _aware(r.expires_at) <= now:
            continue
        u = r.user
        if company_id and (not u or u.company_id != company_id):
            continue
        out.append(
            {
                "id": r.id,
                "user_id": r.user_id,
                "email": u.email if u else None,
                "full_name": u.full_name if u else None,
                "company_id": u.company_id if u else None,
                "ip_address": r.ip_address,
                "user_agent": r.user_agent,
                "last_seen_at": r.last_seen_at,
                "expires_at": r.expires_at,
                "is_impersonation": bool(r.impersonator_user_id),
                "impersonator_user_id": r.impersonator_user_id,
            }
        )
        if len(out) >= limit:
            break
    return out


def force_logout_session(db: Session, session_id: int, actor: User, request: Optional[Request] = None) -> dict:
    row = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    session_service.revoke(db, row.jti)
    platform_audit_service.log(
        db,
        actor=actor,
        action="session.force_logout",
        target_type="session",
        target_id=row.id,
        target_label=str(row.user_id),
        request=request,
    )
    return {"id": row.id, "revoked": True}
