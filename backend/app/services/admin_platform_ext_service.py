from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    BackgroundJob,
    Company,
    ErrorLog,
    FeatureFlag,
    PlatformPermission,
    PlatformRole,
    PlatformRolePermission,
    PlatformAdminRole,
    SecurityEvent,
    SubscriptionInvoice,
    SupportTicket,
    SystemConfiguration,
    TenantFeature,
    User,
    WebhookLog,
)


def _now():
    return datetime.now(timezone.utc)


def record_error(
    db: Session,
    *,
    message: str,
    source: str = "application",
    module: Optional[str] = None,
    severity: str = "error",
    company_id: Optional[int] = None,
    stack_trace: Optional[str] = None,
    path: Optional[str] = None,
    method: Optional[str] = None,
    request_id: Optional[str] = None,
    error_code: Optional[str] = None,
    meta: Any = None,
) -> ErrorLog:
    fp = hashlib.sha256(f"{source}|{module}|{message}|{path}".encode()).hexdigest()[:32]
    existing = (
        db.query(ErrorLog)
        .filter(ErrorLog.fingerprint == fp, ErrorLog.status == "open")
        .first()
    )
    if existing:
        existing.occurrence_count = (existing.occurrence_count or 1) + 1
        existing.last_seen_at = _now()
        if stack_trace:
            existing.stack_trace = stack_trace
        db.commit()
        db.refresh(existing)
        return existing
    row = ErrorLog(
        company_id=company_id,
        source=source,
        module=module,
        severity=severity,
        message=message[:4000],
        stack_trace=stack_trace,
        path=path,
        method=method,
        request_id=request_id,
        error_code=error_code,
        fingerprint=fp,
        meta_json=json.dumps(meta, default=str) if meta is not None else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_errors(
    db: Session,
    *,
    company_id: Optional[int] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = 200,
) -> list[ErrorLog]:
    q = db.query(ErrorLog)
    if company_id:
        q = q.filter(ErrorLog.company_id == company_id)
    if severity:
        q = q.filter(ErrorLog.severity == severity)
    if status:
        q = q.filter(ErrorLog.status == status)
    if source:
        q = q.filter(ErrorLog.source == source)
    return q.order_by(ErrorLog.last_seen_at.desc()).limit(min(limit, 500)).all()


def resolve_error(db: Session, error_id: int, actor: User) -> ErrorLog:
    row = db.query(ErrorLog).filter(ErrorLog.id == error_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Error not found")
    row.status = "resolved"
    row.resolved_at = _now()
    row.resolved_by_user_id = actor.id
    db.commit()
    db.refresh(row)
    return row


def record_security_event(
    db: Session,
    *,
    event_type: str,
    message: Optional[str] = None,
    severity: str = "info",
    company_id: Optional[int] = None,
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    meta: Any = None,
) -> SecurityEvent:
    row = SecurityEvent(
        event_type=event_type,
        message=message,
        severity=severity,
        company_id=company_id,
        user_id=user_id,
        ip_address=ip_address,
        user_agent=(user_agent or "")[:500] or None,
        meta_json=json.dumps(meta, default=str) if meta is not None else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_security_events(db: Session, *, company_id: Optional[int] = None, limit: int = 200) -> list[SecurityEvent]:
    q = db.query(SecurityEvent)
    if company_id:
        q = q.filter(SecurityEvent.company_id == company_id)
    return q.order_by(SecurityEvent.id.desc()).limit(min(limit, 500)).all()


def list_feature_flags(db: Session) -> list[FeatureFlag]:
    return db.query(FeatureFlag).order_by(FeatureFlag.key).all()


def upsert_feature_flag(db: Session, key: str, payload: dict) -> FeatureFlag:
    row = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if not row:
        row = FeatureFlag(key=key, name=payload.get("name") or key)
        db.add(row)
    if "name" in payload:
        row.name = payload["name"]
    if "description" in payload:
        row.description = payload["description"]
    if "enabled" in payload:
        row.enabled = bool(payload["enabled"])
    db.commit()
    db.refresh(row)
    return row


def list_tenant_features(db: Session, company_id: int) -> list[TenantFeature]:
    return db.query(TenantFeature).filter(TenantFeature.company_id == company_id).all()


def set_tenant_feature(db: Session, company_id: int, feature_key: str, payload: dict) -> TenantFeature:
    row = (
        db.query(TenantFeature)
        .filter(TenantFeature.company_id == company_id, TenantFeature.feature_key == feature_key)
        .first()
    )
    if not row:
        row = TenantFeature(company_id=company_id, feature_key=feature_key)
        db.add(row)
    if "enabled" in payload:
        row.enabled = bool(payload["enabled"])
    if "limit_value" in payload:
        row.limit_value = payload["limit_value"]
    if "config_json" in payload:
        row.config_json = payload["config_json"] if isinstance(payload["config_json"], str) else json.dumps(payload["config_json"])
    db.commit()
    db.refresh(row)
    return row


def list_jobs(db: Session, *, status: Optional[str] = None, limit: int = 200) -> list[BackgroundJob]:
    q = db.query(BackgroundJob)
    if status:
        q = q.filter(BackgroundJob.status == status)
    return q.order_by(BackgroundJob.id.desc()).limit(min(limit, 500)).all()


def retry_job(db: Session, job_id: int) -> BackgroundJob:
    row = db.query(BackgroundJob).filter(BackgroundJob.id == job_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    if row.status not in ("failed", "cancelled"):
        raise HTTPException(status_code=400, detail="Only failed/cancelled jobs can be retried")
    row.status = "queued"
    row.error_message = None
    row.attempts = (row.attempts or 0) + 1
    row.started_at = None
    row.finished_at = None
    db.commit()
    db.refresh(row)
    return row


def cancel_job(db: Session, job_id: int) -> BackgroundJob:
    row = db.query(BackgroundJob).filter(BackgroundJob.id == job_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    if row.status in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Job already finished")
    row.status = "cancelled"
    row.finished_at = _now()
    db.commit()
    db.refresh(row)
    return row


def list_webhooks(db: Session, *, company_id: Optional[int] = None, limit: int = 200) -> list[WebhookLog]:
    q = db.query(WebhookLog)
    if company_id:
        q = q.filter(WebhookLog.company_id == company_id)
    return q.order_by(WebhookLog.id.desc()).limit(min(limit, 500)).all()


def global_search(db: Session, q: str, limit: int = 20) -> dict[str, list]:
    term = (q or "").strip()
    if len(term) < 2:
        return {"tenants": [], "users": [], "tickets": [], "invoices": [], "errors": []}
    like = f"%{term}%"
    tenants = (
        db.query(Company)
        .filter(or_(Company.name.ilike(like), Company.email.ilike(like), Company.phone.ilike(like)))
        .limit(limit)
        .all()
    )
    users = (
        db.query(User)
        .filter(or_(User.email.ilike(like), User.full_name.ilike(like)))
        .limit(limit)
        .all()
    )
    tickets = (
        db.query(SupportTicket)
        .filter(or_(SupportTicket.ticket_number.ilike(like), SupportTicket.subject.ilike(like)))
        .limit(limit)
        .all()
    )
    invoices = (
        db.query(SubscriptionInvoice)
        .filter(SubscriptionInvoice.invoice_number.ilike(like))
        .limit(limit)
        .all()
    )
    errors = db.query(ErrorLog).filter(ErrorLog.message.ilike(like)).limit(limit).all()
    return {
        "tenants": [{"id": c.id, "name": c.name, "status": c.subscription_status} for c in tenants],
        "users": [
            {"id": u.id, "email": u.email, "full_name": u.full_name, "company_id": u.company_id, "role": u.role}
            for u in users
        ],
        "tickets": [
            {"id": t.id, "ticket_number": t.ticket_number, "subject": t.subject, "status": t.status, "company_id": t.company_id}
            for t in tickets
        ],
        "invoices": [
            {"id": i.id, "invoice_number": i.invoice_number, "status": i.status, "company_id": i.company_id, "total_amount": i.total_amount}
            for i in invoices
        ],
        "errors": [{"id": e.id, "message": e.message[:200], "severity": e.severity, "status": e.status} for e in errors],
    }


PLATFORM_PERMS = [
    ("tenants", "read", "tenants.read", False),
    ("tenants", "write", "tenants.write", True),
    ("tenants", "lock", "tenants.lock", True),
    ("billing", "read", "billing.read", False),
    ("billing", "write", "billing.write", True),
    ("trials", "read", "trials.read", False),
    ("trials", "write", "trials.write", True),
    ("refunds", "read", "refunds.read", False),
    ("refunds", "create", "refunds.create", True),
    ("refunds", "approve", "refunds.approve", True),
    ("refunds", "process", "refunds.process", True),
    ("refunds", "cancel", "refunds.cancel", True),
    ("refunds", "override", "refunds.override", True),
    ("refunds", "policies", "refunds.policies", True),
    ("support", "read", "support.read", False),
    ("support", "write", "support.write", False),
    ("security", "read", "security.read", False),
    ("security", "write", "security.write", True),
    ("ops", "read", "ops.read", False),
    ("ops", "write", "ops.write", True),
    ("config", "read", "config.read", False),
    ("config", "write", "config.write", True),
    ("audit", "read", "audit.read", False),
    ("impersonate", "start", "impersonate.start", True),
]

PLATFORM_ROLES = [
    ("super_admin", "Super Admin", True),
    ("platform_admin", "Platform Admin", True),
    ("billing_admin", "Billing Admin", True),
    ("support_admin", "Support Admin", True),
    ("security_admin", "Security Admin", True),
    ("operations_admin", "Operations Admin", True),
    ("admin_viewer", "Admin Viewer", True),
]

_REFUND_ALL = [
    "refunds.read",
    "refunds.create",
    "refunds.approve",
    "refunds.process",
    "refunds.cancel",
    "refunds.override",
    "refunds.policies",
]

ROLE_PERMS = {
    "super_admin": [p[2] for p in PLATFORM_PERMS],
    "platform_admin": [p[2] for p in PLATFORM_PERMS if p[2] != "impersonate.start"],
    "billing_admin": [
        "tenants.read",
        "billing.read",
        "billing.write",
        "trials.read",
        "trials.write",
        "audit.read",
        *_REFUND_ALL,
    ],
    "support_admin": [
        "tenants.read",
        "support.read",
        "support.write",
        "trials.read",
        "impersonate.start",
        "audit.read",
        "refunds.read",
        "refunds.create",
    ],
    "security_admin": ["tenants.read", "security.read", "security.write", "audit.read"],
    "operations_admin": ["tenants.read", "ops.read", "ops.write", "audit.read"],
    "admin_viewer": [
        "tenants.read",
        "billing.read",
        "trials.read",
        "refunds.read",
        "support.read",
        "security.read",
        "ops.read",
        "config.read",
        "audit.read",
    ],
}


def ensure_platform_rbac(db: Session) -> None:
    perm_by_code = {}
    for module, action, code, sensitive in PLATFORM_PERMS:
        row = db.query(PlatformPermission).filter(PlatformPermission.code == code).first()
        if not row:
            row = PlatformPermission(module=module, action=action, code=code, is_sensitive=sensitive)
            db.add(row)
            db.flush()
        perm_by_code[code] = row
    for slug, name, is_system in PLATFORM_ROLES:
        role = db.query(PlatformRole).filter(PlatformRole.slug == slug).first()
        if not role:
            role = PlatformRole(slug=slug, name=name, is_system=is_system)
            db.add(role)
            db.flush()
        codes = ROLE_PERMS.get(slug, [])
        for code in codes:
            perm = perm_by_code.get(code)
            if not perm:
                continue
            exists = (
                db.query(PlatformRolePermission)
                .filter(PlatformRolePermission.role_id == role.id, PlatformRolePermission.permission_id == perm.id)
                .first()
            )
            if not exists:
                db.add(PlatformRolePermission(role_id=role.id, permission_id=perm.id))
    db.commit()


def list_platform_roles(db: Session) -> list[dict]:
    ensure_platform_rbac(db)
    roles = db.query(PlatformRole).order_by(PlatformRole.id).all()
    out = []
    for r in roles:
        links = db.query(PlatformRolePermission).filter(PlatformRolePermission.role_id == r.id).all()
        codes = []
        for link in links:
            p = db.query(PlatformPermission).filter(PlatformPermission.id == link.permission_id).first()
            if p:
                codes.append(p.code)
        out.append({"id": r.id, "slug": r.slug, "name": r.name, "description": r.description, "is_system": r.is_system, "permissions": codes})
    return out


def get_config(db: Session, key: str, default: Any = None) -> Any:
    row = db.query(SystemConfiguration).filter(SystemConfiguration.key == key).first()
    if not row or not row.value_json:
        return default
    try:
        return json.loads(row.value_json)
    except (TypeError, ValueError):
        return default


def set_config(db: Session, key: str, value: Any, *, actor: Optional[User] = None, category: str = "general", is_sensitive: bool = False) -> dict:
    row = db.query(SystemConfiguration).filter(SystemConfiguration.key == key).first()
    if not row:
        row = SystemConfiguration(key=key)
        db.add(row)
    row.value_json = json.dumps(value, default=str)
    row.category = category
    row.is_sensitive = is_sensitive
    if actor:
        row.updated_by_user_id = actor.id
    db.commit()
    return {"key": key, "value": value, "category": category}


def list_config(db: Session) -> list[dict]:
    rows = db.query(SystemConfiguration).order_by(SystemConfiguration.key).all()
    out = []
    for r in rows:
        try:
            value = json.loads(r.value_json) if r.value_json else None
        except (TypeError, ValueError):
            value = None
        if r.is_sensitive and isinstance(value, dict):
            value = {k: ("***" if "password" in k.lower() or "secret" in k.lower() or "token" in k.lower() else v) for k, v in value.items()}
        out.append({"key": r.key, "value": value, "category": r.category, "is_sensitive": r.is_sensitive, "updated_at": r.updated_at})
    return out
