from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import (
    Company,
    EmailLog,
    LoginLog,
    SecurityEvent,
    SubscriptionInvoice,
    SupportTicket,
    User,
)
from app.services import platform_audit_service


def _now():
    return datetime.now(timezone.utc)


def export_tenant_data(db: Session, company_id: int) -> dict[str, Any]:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    users = db.query(User).filter(User.company_id == company_id).all()
    invoices = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.company_id == company_id).all()
    tickets = db.query(SupportTicket).filter(SupportTicket.company_id == company_id).all()
    logins = db.query(LoginLog).filter(LoginLog.company_id == company_id).order_by(LoginLog.id.desc()).limit(500).all()
    emails = db.query(EmailLog).filter(EmailLog.company_id == company_id).order_by(EmailLog.id.desc()).limit(500).all()
    return {
        "exported_at": _now().isoformat(),
        "company": {
            "id": co.id,
            "name": co.name,
            "email": co.email,
            "phone": co.phone,
            "address": co.address,
            "registration_number": co.registration_number,
            "vat_number": co.vat_number,
            "subscription_tier": co.subscription_tier,
            "subscription_status": co.subscription_status,
            "created_at": co.created_at.isoformat() if co.created_at else None,
        },
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
        "subscription_invoices": [
            {
                "invoice_number": i.invoice_number,
                "status": i.status,
                "total_amount": i.total_amount,
                "amount_paid": i.amount_paid,
                "due_date": str(i.due_date),
                "paid_at": i.paid_at.isoformat() if i.paid_at else None,
            }
            for i in invoices
        ],
        "support_tickets": [
            {"ticket_number": t.ticket_number, "subject": t.subject, "status": t.status, "priority": t.priority}
            for t in tickets
        ],
        "login_history": [
            {"email": r.email, "login_at": r.login_at.isoformat() if r.login_at else None, "ip": r.ip_address, "status": r.status}
            for r in logins
        ],
        "email_logs": [
            {"recipient": r.recipient, "subject": r.subject, "status": r.status, "sent_at": r.sent_at.isoformat() if r.sent_at else None}
            for r in emails
        ],
    }


def export_tenant_csv(db: Session, company_id: int) -> str:
    data = export_tenant_data(db, company_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["section", "field", "value"])
    for k, v in data["company"].items():
        w.writerow(["company", k, v])
    for u in data["users"]:
        w.writerow(["user", u["email"], json.dumps(u)])
    return buf.getvalue()


def get_retention_policy(db: Session) -> dict:
    from app.services.admin_platform_ext_service import get_config
    return get_config(
        db,
        "data_retention",
        {
            "login_logs_days": 365,
            "audit_logs_days": 730,
            "api_usage_days": 90,
            "email_logs_days": 365,
            "error_logs_days": 180,
            "security_events_days": 365,
        },
    )


def set_retention_policy(db: Session, policy: dict, actor: User) -> dict:
    from app.services.admin_platform_ext_service import set_config
    return set_config(db, "data_retention", policy, actor=actor, category="compliance")


def purge_expired_logs(db: Session, actor: Optional[User] = None) -> dict:
    policy = get_retention_policy(db)
    now = _now()
    counts = {}
    mapping = [
        ("login_logs_days", LoginLog, LoginLog.login_at),
        ("api_usage_days", __import__("app.models", fromlist=["ApiUsageLog"]).ApiUsageLog, None),
        ("email_logs_days", EmailLog, EmailLog.sent_at),
        ("error_logs_days", __import__("app.models", fromlist=["ErrorLog"]).ErrorLog, None),
        ("security_events_days", SecurityEvent, SecurityEvent.created_at),
    ]
    from app.models import ApiUsageLog, ErrorLog

    pairs = [
        ("login_logs", LoginLog, LoginLog.login_at, policy.get("login_logs_days", 365)),
        ("api_usage", ApiUsageLog, ApiUsageLog.logged_at, policy.get("api_usage_days", 90)),
        ("email_logs", EmailLog, EmailLog.sent_at, policy.get("email_logs_days", 365)),
        ("error_logs", ErrorLog, ErrorLog.last_seen_at, policy.get("error_logs_days", 180)),
        ("security_events", SecurityEvent, SecurityEvent.created_at, policy.get("security_events_days", 365)),
    ]
    for name, model, col, days in pairs:
        cutoff = now - timedelta(days=int(days))
        deleted = db.query(model).filter(col < cutoff).delete(synchronize_session=False)
        counts[name] = deleted
    db.commit()
    if actor:
        platform_audit_service.log(
            db,
            actor=actor,
            action="gdpr.purge_logs",
            target_type="system",
            after=counts,
        )
    return counts


def delete_tenant_workflow(
    db: Session,
    company_id: int,
    *,
    actor: User,
    confirm_name: str,
    hard_delete: bool = False,
    request=None,
) -> dict:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    if confirm_name.strip() != co.name:
        raise HTTPException(status_code=400, detail="Confirmation name does not match")
    before = {"id": co.id, "name": co.name, "hard_delete": hard_delete}
    if not hard_delete:
        co.account_status = "deactivated"
        co.archived_at = _now()
        co.archived_by_user_id = actor.id
        co.subscription_status = "cancelled"
        for u in db.query(User).filter(User.company_id == co.id).all():
            if u.role != "super_admin":
                u.is_active = False
                # Soft PII redaction marker
                if not u.email.endswith(".deleted"):
                    u.email = f"deleted+{u.id}.{co.id}@redacted.local"
                    u.full_name = "Deleted User"
        db.commit()
        platform_audit_service.log(
            db,
            actor=actor,
            action="gdpr.tenant_anonymized",
            target_type="company",
            target_id=co.id,
            target_label=before["name"],
            before=before,
            request=request,
        )
        return {"status": "anonymized", "company_id": company_id}

    # Hard delete is destructive — only after anonymize path confirmation via hard_delete flag.
    # Prefer soft anonymize; hard delete removes the company row cascade where configured.
    name = co.name
    for u in db.query(User).filter(User.company_id == co.id).all():
        db.delete(u)
    db.delete(co)
    db.commit()
    platform_audit_service.log(
        db,
        actor=actor,
        action="gdpr.tenant_hard_deleted",
        target_type="company",
        target_id=company_id,
        target_label=name,
        before=before,
        request=request,
    )
    return {"status": "deleted", "company_id": company_id}
