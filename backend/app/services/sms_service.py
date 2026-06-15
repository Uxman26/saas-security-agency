import json
import os
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Company, SmsLog
from app.services.company_service import get_company_by_user_id
from app.services.module_service import is_module_enabled

DEFAULT_TEMPLATES = {
    "shift_reminder": "Reminder: You have a shift on {date} at {site}.",
    "invoice_sent": "Invoice #{invoice_id} for {amount} is due on {due_date}.",
    "payment_reminder": "Payment reminder: {amount} outstanding on invoice #{invoice_id}.",
    "appointment": "Appointment reminder for {date} at {time}.",
    "alert": "{message}",
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


def get_sms_config(db: Session, user_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    return {
        "account_sid_set": bool(company.twilio_account_sid),
        "auth_token_set": bool(company.twilio_auth_token),
        "phone_number": company.twilio_phone_number,
        "templates": parse_templates(company.sms_templates_json),
        "enabled": is_module_enabled(company, "whatsapp"),
    }


def update_sms_config(db: Session, user_id: int, payload: dict) -> dict:
    company = get_company_by_user_id(db, user_id)
    for k in ("twilio_account_sid", "twilio_auth_token", "twilio_phone_number"):
        if k in payload and payload[k] is not None:
            setattr(company, k, payload[k])
    if "templates" in payload and payload["templates"] is not None:
        company.sms_templates_json = json.dumps(payload["templates"])
    db.commit()
    db.refresh(company)
    return get_sms_config(db, user_id)


def _twilio_client(company: Company):
    sid = company.twilio_account_sid or os.environ.get("TWILIO_ACCOUNT_SID")
    token = company.twilio_auth_token or os.environ.get("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        raise HTTPException(status_code=400, detail="Twilio credentials not configured")
    try:
        from twilio.rest import Client
    except ImportError:
        raise HTTPException(status_code=500, detail="Twilio library not installed")
    return Client(sid, token), company.twilio_phone_number or os.environ.get("TWILIO_PHONE_NUMBER")


def send_sms(db: Session, user_id: int, recipient: str, body: str, template_key: Optional[str] = None) -> SmsLog:
    company = get_company_by_user_id(db, user_id)
    if not is_module_enabled(company, "whatsapp"):
        raise HTTPException(status_code=403, detail="SMS module is not enabled")
    to = recipient.strip()
    if not to:
        raise HTTPException(status_code=400, detail="Recipient required")
    log = SmsLog(company_id=company.id, recipient=to, body=body, template_key=template_key, status="pending")
    db.add(log)
    db.flush()
    try:
        client, from_num = _twilio_client(company)
        if not from_num:
            raise HTTPException(status_code=400, detail="Twilio phone number not configured")
        msg = client.messages.create(body=body, from_=from_num, to=to)
        log.status = "sent"
        log.twilio_sid = msg.sid
    except HTTPException:
        raise
    except Exception as e:
        log.status = "failed"
        log.error_message = str(e)[:500]
    db.commit()
    db.refresh(log)
    if log.status == "failed":
        raise HTTPException(status_code=502, detail=log.error_message or "SMS delivery failed")
    return log


def list_sms_logs(db: Session, user_id: int, limit: int = 200) -> list[SmsLog]:
    company = get_company_by_user_id(db, user_id)
    return db.query(SmsLog).filter(SmsLog.company_id == company.id).order_by(SmsLog.id.desc()).limit(limit).all()
