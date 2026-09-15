from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.html_safe import esc
from app.models import NotificationTemplate, PlatformNotification
from app.services import email_service
from app.services.admin_billing_notify_service import ensure_templates, render_template


def _now():
    return datetime.now(timezone.utc)


def _html_wrap(body: str) -> str:
    text = (body or "").strip()
    if "<" in text and ">" in text:
        return text
    paragraphs = "".join(f"<p>{esc(p.strip())}</p>" for p in text.split("\n") if p.strip())
    return paragraphs or f"<p>{esc(text)}</p>"


def send_template_email(
    db: Session,
    *,
    key: str,
    to_email: str,
    variables: dict[str, Any],
    company_id: Optional[int] = None,
    user_id: Optional[int] = None,
    sent_by_user_id: Optional[int] = None,
    fallback_subject: str = "",
    fallback_body: str = "",
) -> bool:
    if not to_email or not email_service.is_configured():
        return False
    ensure_templates(db)
    tmpl = db.query(NotificationTemplate).filter(NotificationTemplate.key == key).first()
    if tmpl and tmpl.is_active is False:
        return False
    subject = render_template((tmpl.subject if tmpl else None) or fallback_subject or key, variables)
    raw_body = (tmpl.body if tmpl else None) or fallback_body or ""
    body = _html_wrap(render_template(raw_body, variables))
    row = PlatformNotification(
        company_id=company_id,
        user_id=user_id,
        template_key=key,
        channel="email",
        subject=subject,
        body=body,
        status="queued",
        sent_by_user_id=sent_by_user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    try:
        email_service.send_email(to_email, subject, body)
        row.status = "sent"
        row.sent_at = _now()
        db.commit()
        return True
    except Exception as e:
        row.status = "failed"
        row.error_message = str(e)[:500]
        db.commit()
        return False
