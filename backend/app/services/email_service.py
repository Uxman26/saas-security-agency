import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import EmailLog
from app.services.platform_smtp_service import get_smtp_config


def is_configured() -> bool:
    cfg = get_smtp_config()
    return bool(cfg.get("mail_username") and cfg.get("mail_password"))


def send_email(to_email: str, subject: str, body: str) -> bool:
    if not is_configured():
        raise HTTPException(status_code=500, detail="Email service not configured")
    if not to_email:
        raise HTTPException(status_code=400, detail="Recipient email is required")
    cfg = get_smtp_config()
    try:
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
        send_email(to_email, subject, body)
        log.status = "sent"
    except HTTPException as e:
        log.status = "failed"
        db.commit()
        raise e
    db.commit()
    db.refresh(log)
    return log
