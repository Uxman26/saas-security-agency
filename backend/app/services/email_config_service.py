import json
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import EmailLog
from app.services.company_service import get_company_by_user_id
from app.services import email_service
from app.services.module_service import is_module_enabled

DEFAULT_TEMPLATES = {
    "shift_reminder": "<p>Reminder: You have a shift on {date} at {site}. {shift}</p>",
    "invoice_sent": "<p>Invoice #{invoice_id} for {amount} is due on {due_date}.</p>",
    "payment_reminder": "<p>Payment reminder: {amount} outstanding on invoice #{invoice_id}.</p>",
    "appointment": "<p>Appointment reminder for {date} at {time}.</p>",
    "alert": "<p>{message}</p>",
}


def parse_templates(raw: str | None) -> dict[str, str]:
    base = dict(DEFAULT_TEMPLATES)
    if not raw:
        return base
    try:
        d = json.loads(raw)
        if isinstance(d, dict):
            base.update({k: str(v) for k, v in d.items()})
    except json.JSONDecodeError:
        pass
    return base


def get_email_config(db: Session, user_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    configured = email_service.is_company_configured(company)
    # Only return what the tenant saved — no platform/env defaults in the form.
    return {
        "smtp_configured": configured,
        "mail_server": company.smtp_server or "",
        "mail_port": int(company.smtp_port or 587) if company.smtp_server else None,
        "mail_username": company.smtp_username or "",
        "password_set": bool(company.smtp_password),
        "mail_from": company.smtp_from or "",
        "mail_from_name": company.smtp_from_name or "",
        "templates": parse_templates(company.email_templates_json),
        "enabled": is_module_enabled(company, "email"),
    }


def update_email_config(db: Session, user_id: int, payload: dict) -> dict:
    company = get_company_by_user_id(db, user_id)
    if "templates" in payload and payload["templates"] is not None:
        company.email_templates_json = json.dumps(payload["templates"])
    if "mail_server" in payload and payload["mail_server"] is not None:
        company.smtp_server = payload["mail_server"].strip() or None
    if "mail_port" in payload and payload["mail_port"] is not None:
        try:
            company.smtp_port = int(payload["mail_port"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="mail_port must be a number")
    if "mail_username" in payload and payload["mail_username"] is not None:
        company.smtp_username = payload["mail_username"].strip() or None
    if payload.get("mail_password"):
        company.smtp_password = payload["mail_password"]
    if "mail_from" in payload and payload["mail_from"] is not None:
        company.smtp_from = payload["mail_from"].strip() or None
    if "mail_from_name" in payload and payload["mail_from_name"] is not None:
        company.smtp_from_name = payload["mail_from_name"].strip() or None
    db.commit()
    db.refresh(company)
    return get_email_config(db, user_id)


def list_email_logs(db: Session, user_id: int, limit: int = 100) -> list[EmailLog]:
    company = get_company_by_user_id(db, user_id)
    return (
        db.query(EmailLog)
        .filter(EmailLog.company_id == company.id)
        .order_by(EmailLog.id.desc())
        .limit(limit)
        .all()
    )


def send_tenant_email(
    db: Session,
    user_id: int,
    to_email: str,
    subject: str,
    body: str,
    template_key: Optional[str] = None,
) -> EmailLog:
    company = get_company_by_user_id(db, user_id)
    if not is_module_enabled(company, "email"):
        raise HTTPException(status_code=403, detail="Email module is not enabled")
    if not email_service.is_company_configured(company):
        raise HTTPException(status_code=400, detail="SMTP not configured. Add your mail server settings first.")
    return email_service.send_and_log(db, company.id, to_email.strip(), subject, body, template_key)
