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
    PaymentRefund,
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
        "body": "Click the link to reset your password: {{reset_url}}",
    },
    {
        "key": "account_locked",
        "name": "Account locked",
        "channel": "email",
        "subject": "Your ControlOps account was locked",
        "body": "Your tenant account {{company_name}} was locked. Contact support if this was unexpected.",
    },
    {
        "key": "billing_overdue",
        "name": "Billing overdue",
        "channel": "email",
        "subject": "Invoice overdue — {{invoice_number}}",
        "body": "Invoice {{invoice_number}} for {{company_name}} is overdue. Amount due: {{amount}}.",
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
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    inv = None
    if invoice_id:
        inv = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.id == invoice_id).first()
        if not inv or inv.company_id != company_id:
            raise HTTPException(status_code=404, detail="Invoice not found")
        paid = float(inv.amount_paid or 0)
        if amount > paid:
            raise HTTPException(status_code=400, detail="Refund exceeds amount paid")
        inv.amount_paid = round(paid - amount, 2)
        if inv.amount_paid <= 0:
            inv.status = "refunded"
            inv.amount_paid = 0
        elif inv.amount_paid < float(inv.total_amount or 0):
            inv.status = "partial"
    row = PaymentRefund(
        company_id=company_id,
        subscription_invoice_id=invoice_id,
        amount=amount,
        reason=reason,
        status="completed",
        actor_user_id=actor.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    platform_audit_service.log(
        db,
        actor=actor,
        action="payment.refunded",
        target_type="refund",
        target_id=row.id,
        company_id=company_id,
        after={"amount": amount, "invoice_id": invoice_id},
        note=reason,
        request=request,
    )
    return {
        "id": row.id,
        "company_id": row.company_id,
        "subscription_invoice_id": row.subscription_invoice_id,
        "amount": row.amount,
        "currency": row.currency,
        "reason": row.reason,
        "status": row.status,
        "created_at": row.created_at,
    }


def list_refunds(db: Session, company_id: Optional[int] = None) -> list[dict]:
    q = db.query(PaymentRefund)
    if company_id:
        q = q.filter(PaymentRefund.company_id == company_id)
    return [
        {
            "id": r.id,
            "company_id": r.company_id,
            "subscription_invoice_id": r.subscription_invoice_id,
            "amount": r.amount,
            "currency": r.currency,
            "reason": r.reason,
            "status": r.status,
            "actor_user_id": r.actor_user_id,
            "created_at": r.created_at,
        }
        for r in q.order_by(PaymentRefund.id.desc()).limit(200).all()
    ]


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
