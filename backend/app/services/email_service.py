import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Company, EmailLog
from app.services.platform_smtp_service import get_smtp_config


def is_configured() -> bool:
    cfg = get_smtp_config()
    return bool(cfg.get("mail_username") and cfg.get("mail_password"))


def is_company_configured(company: Optional[Company]) -> bool:
    if not company:
        return False
    return bool(company.smtp_server and company.smtp_username and company.smtp_password)


def company_smtp_config(company: Company) -> dict[str, Any]:
    if not is_company_configured(company):
        raise HTTPException(status_code=400, detail="SMTP not configured. Add your mail server settings in Email settings.")
    return {
        "mail_server": company.smtp_server,
        "mail_port": int(company.smtp_port or 587),
        "mail_username": company.smtp_username,
        "mail_password": company.smtp_password,
        "mail_from": (company.email or settings.mail_from).strip(),
        "mail_from_name": (company.name or settings.mail_from_name).strip(),
    }


def _send_with_config(cfg: dict[str, Any], to_email: str, subject: str, body: str) -> None:
    msg = MIMEMultipart()
    msg["From"] = f"{cfg['mail_from_name']} <{cfg['mail_from']}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html"))
    server = smtplib.SMTP(cfg["mail_server"], cfg["mail_port"])
    server.starttls()
    server.login(cfg["mail_username"], cfg["mail_password"])
    server.send_message(msg)
    server.quit()


def send_email(to_email: str, subject: str, body: str) -> bool:
    if not is_configured():
        raise HTTPException(status_code=500, detail="Email service not configured")
    if not to_email:
        raise HTTPException(status_code=400, detail="Recipient email is required")
    cfg = get_smtp_config()
    try:
        _send_with_config(cfg, to_email, subject, body)
        return True
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


def send_company_email(company: Company, to_email: str, subject: str, body: str) -> bool:
    if not to_email:
        raise HTTPException(status_code=400, detail="Recipient email is required")
    cfg = company_smtp_config(company)
    try:
        _send_with_config(cfg, to_email, subject, body)
        return True
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


def send_and_log(
    db: Session,
    company_id: int,
    to_email: str,
    subject: str,
    body: str,
    template_key: Optional[str] = None,
) -> EmailLog:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    log = EmailLog(
        company_id=company_id,
        recipient=to_email,
        subject=subject,
        template_key=template_key,
        status="pending",
    )
    db.add(log)
    db.flush()
    try:
        send_company_email(company, to_email, subject, body)
        log.status = "sent"
    except HTTPException as e:
        log.status = "failed"
        db.commit()
        raise e
    db.commit()
    db.refresh(log)
    return log
