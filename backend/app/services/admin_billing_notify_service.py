from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models import (
    NotificationTemplate,
    PlatformNotification,
    SubscriptionInvoice,
    SupportTicket,
    SupportTicketAttachment,
    User,
)
from app.services import platform_audit_service


def _now():
    return datetime.now(timezone.utc)


DEFAULT_TEMPLATES = [
    {
        "key": "password_reset",
        "name": "Password reset",
        "channel": "email",
        "subject": "Reset your ControlOps password",
        "body": "Hi {{full_name}},\n\nClick the link to reset your password (expires in 1 hour):\n{{reset_url}}\n\nIf you did not request this, you can ignore this email.",
    },
    {
        "key": "account_verification",
        "name": "Account verification",
        "channel": "email",
        "subject": "Verify your ControlOps email",
        "body": "Hi {{full_name}},\n\nPlease verify your email address to activate your ControlOps account:\n{{verify_url}}\n\nThis link expires in 24 hours.",
    },
    {
        "key": "welcome_onboarding",
        "name": "Welcome / onboarding",
        "channel": "email",
        "subject": "Welcome to ControlOps",
        "body": "Hi {{full_name}},\n\nWelcome to ControlOps. Your company {{company_name}} is ready — sign in to finish setup and invite your team.\n\n{{login_url}}",
    },
    {
        "key": "login_security_alert",
        "name": "Login / security alert",
        "channel": "email",
        "subject": "Security alert for your ControlOps account",
        "body": "Hi {{full_name}},\n\nWe detected a security event on your account ({{email}}): {{action}}.\n\nIf this was not you, reset your password immediately.",
    },
    {
        "key": "account_lockout",
        "name": "Account lockout",
        "channel": "email",
        "subject": "Your ControlOps sign-in is temporarily locked",
        "body": "Hi {{full_name}},\n\nYour account was temporarily locked for {{lockout_minutes}} minute(s) after repeated failed sign-in attempts.\n\nYou can try again after {{locked_until}}. Another failed attempt after the lockout may require a password reset.",
    },
    {
        "key": "account_locked",
        "name": "Tenant account locked",
        "channel": "email",
        "subject": "Your ControlOps account was locked",
        "body": "Your tenant account {{company_name}} was locked. Contact support if this was unexpected.",
    },
    {
        "key": "trial_reminder",
        "name": "Trial reminder",
        "channel": "email",
        "subject": "Your ControlOps trial reminder",
        "body": "Hi {{full_name}},\n\nThis is a reminder about the ControlOps trial for {{company_name}}. {{message}}",
    },
    {
        "key": "trial_expiring",
        "name": "Trial expiring soon",
        "channel": "email",
        "subject": "Your ControlOps trial ends in {{days}} day(s)",
        "body": "Your trial for {{company_name}} ({{tier}}) ends on {{ends_at}}. Upgrade in Billing to keep full access to operational features. Your existing data remains safe.",
    },
    {
        "key": "trial_expired",
        "name": "Trial expired",
        "channel": "email",
        "subject": "Your ControlOps trial has ended",
        "body": "The trial for {{company_name}} has ended. You can still sign in to view your data and upgrade from Billing settings.",
    },
    {
        "key": "subscription_billing",
        "name": "Subscription / billing notification",
        "channel": "email",
        "subject": "ControlOps billing update — {{company_name}}",
        "body": "Hi {{full_name}},\n\n{{message}}\n\nPlan: {{tier}}\nAmount: {{amount}}",
    },
    {
        "key": "payment_notification",
        "name": "Payment notification",
        "channel": "email",
        "subject": "Payment update — {{company_name}}",
        "body": "Hi {{full_name}},\n\n{{message}}\n\nReference: {{reference}}\nAmount: {{amount}}",
    },
    {
        "key": "billing_overdue",
        "name": "Billing overdue",
        "channel": "email",
        "subject": "Invoice overdue — {{invoice_number}}",
        "body": "Invoice {{invoice_number}} for {{company_name}} is overdue. Amount due: {{amount}}.",
    },
    {
        "key": "expiry_renewal",
        "name": "Expiry / renewal reminder",
        "channel": "email",
        "subject": "Renewal reminder — {{company_name}}",
        "body": "Hi {{full_name}},\n\nYour ControlOps subscription for {{company_name}} renews or expires on {{ends_at}}. {{message}}",
    },
    {
        "key": "refund_processed",
        "name": "Refund processed",
        "channel": "email",
        "subject": "Refund processed — {{amount}}",
        "body": "A refund of {{amount}} {{currency}} for {{company_name}} has been processed. Reference: refund #{{refund_id}}. Reason: {{reason}}.",
    },
    {
        "key": "promotional_marketing",
        "name": "Promotional / marketing",
        "channel": "email",
        "subject": "{{subject}}",
        "body": "{{body}}",
    },
    {
        "key": "system_notification",
        "name": "General system notification",
        "channel": "email",
        "subject": "{{subject}}",
        "body": "{{body}}",
    },
    {
        "key": "service_announcement",
        "name": "Service announcement",
        "channel": "email",
        "subject": "{{subject}}",
        "body": "{{body}}",
    },
]


def ensure_templates(db: Session) -> None:
    for t in DEFAULT_TEMPLATES:
        row = db.query(NotificationTemplate).filter(NotificationTemplate.key == t["key"]).first()
        if not row:
            db.add(NotificationTemplate(**t))
    db.commit()


def list_templates(db: Session) -> list[dict]:
    ensure_templates(db)
    return [
        {
            "id": t.id,
            "key": t.key,
            "name": t.name,
            "channel": t.channel,
            "subject": t.subject,
            "body": t.body,
            "is_active": t.is_active,
            "updated_at": t.updated_at,
        }
        for t in db.query(NotificationTemplate).order_by(NotificationTemplate.key).all()
    ]


def upsert_template(db: Session, key: str, payload: dict) -> dict:
    row = db.query(NotificationTemplate).filter(NotificationTemplate.key == key).first()
    if not row:
        row = NotificationTemplate(key=key, name=payload.get("name") or key, body=payload.get("body") or "")
        db.add(row)
    for k in ("name", "channel", "subject", "body", "is_active"):
        if k in payload and payload[k] is not None:
            setattr(row, k, payload[k])
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "key": row.key,
        "name": row.name,
        "channel": row.channel,
        "subject": row.subject,
        "body": row.body,
        "is_active": row.is_active,
    }


def render_template(body: str, vars: dict) -> str:
    out = body or ""
    for k, v in vars.items():
        out = out.replace("{{" + k + "}}", str(v if v is not None else ""))
    return out


def list_notification_logs(db: Session, limit: int = 200) -> list[dict]:
    rows = db.query(PlatformNotification).order_by(PlatformNotification.id.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "company_id": r.company_id,
            "user_id": r.user_id,
            "template_key": r.template_key,
            "channel": r.channel,
            "subject": r.subject,
            "status": r.status,
            "error_message": r.error_message,
            "sent_at": r.sent_at,
            "created_at": r.created_at,
        }
        for r in rows
    ]


def create_refund(
    db: Session,
    *,
    actor: User,
    company_id: int,
    amount: float,
    invoice_id: Optional[int] = None,
    reason: Optional[str] = None,
    request=None,
) -> dict:
    from app.services import refund_service

    return refund_service.create_refund_legacy(
        db,
        actor=actor,
        company_id=company_id,
        amount=amount,
        invoice_id=invoice_id,
        reason=reason,
        request=request,
    )


def list_refunds(db: Session, company_id: Optional[int] = None) -> list[dict]:
    from app.services import refund_service

    return refund_service.list_refunds(db, company_id=company_id)


def mark_invoice_disputed(db: Session, invoice_id: int, actor: User, note: Optional[str] = None, request=None) -> dict:
    inv = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv.status = "disputed"
    db.commit()
    platform_audit_service.log(
        db,
        actor=actor,
        action="payment.disputed",
        target_type="invoice",
        target_id=inv.id,
        target_label=inv.invoice_number,
        company_id=inv.company_id,
        note=note,
        request=request,
    )
    return {"id": inv.id, "status": inv.status, "invoice_number": inv.invoice_number}


UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "tickets")


async def save_ticket_attachment(
    db: Session,
    ticket_id: int,
    file: UploadFile,
    actor: User,
    message_id: Optional[int] = None,
) -> dict:
    t = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "file")[1][:20]
    name = f"{ticket_id}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, name)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    with open(path, "wb") as f:
        f.write(content)
    row = SupportTicketAttachment(
        ticket_id=ticket_id,
        message_id=message_id,
        file_name=file.filename or name,
        file_path=path,
        content_type=file.content_type,
        size_bytes=len(content),
        uploaded_by_user_id=actor.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "file_name": row.file_name,
        "content_type": row.content_type,
        "size_bytes": row.size_bytes,
        "created_at": row.created_at,
    }
