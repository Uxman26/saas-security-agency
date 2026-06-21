from typing import Optional

from sqlalchemy.orm import Session

from app.models import Lead, User
from app.services import email_config_service, email_service
from app.services.company_service import get_company_by_user_id
from app.services.module_service import is_module_enabled


def _lead_templates() -> dict[str, str]:
    base = dict(email_config_service.DEFAULT_TEMPLATES)
    base.update(
        {
            "lead_new": "<p>New lead <strong>{title}</strong> from {source}.</p><p>{body}</p>",
            "lead_assigned": "<p>Lead <strong>{title}</strong> has been assigned to you.</p>",
            "lead_status": "<p>Lead <strong>{title}</strong> status changed to {status}.</p>",
            "lead_follow_up": "<p>Follow-up due for lead <strong>{title}</strong> on {due_at}.</p>",
            "lead_converted": "<p>Lead <strong>{title}</strong> converted to {target_type}.</p>",
        }
    )
    return base


def notify_lead_email(
    db: Session,
    user_id: int,
    recipient_id: int,
    template_key: str,
    subject: str,
    **ctx,
) -> None:
    user = db.query(User).filter(User.id == recipient_id, User.is_active == True).first()
    if not user or not user.email:
        return
    try:
        company = get_company_by_user_id(db, user_id)
        if not is_module_enabled(company, "email") or not email_service.is_company_configured(company):
            return
        templates = email_config_service.parse_templates(company.email_templates_json)
        tpl = templates.get(template_key) or _lead_templates().get(template_key, "<p>{message}</p>")
        body = tpl.format(**{k: str(v) for k, v in ctx.items()})
        email_service.send_and_log(db, company.id, user.email, subject, body, template_key)
    except Exception:
        pass


def email_for_lead_event(
    db: Session,
    actor_id: int,
    lead: Lead,
    kind: str,
    extra: Optional[str] = None,
    recipient_id: Optional[int] = None,
) -> None:
    ctx = {
        "title": lead.title,
        "source": lead.source or "unknown",
        "body": extra or "",
        "status": extra or lead.status,
        "due_at": extra or "",
        "target_type": extra or "",
        "message": extra or lead.title,
    }
    mapping = {
        "lead_new": ("lead_new", f"New lead: {lead.title}"),
        "lead_assigned": ("lead_assigned", f"Lead assigned: {lead.title}"),
        "lead_status": ("lead_status", f"Lead status update: {lead.title}"),
        "follow_up_due": ("lead_follow_up", f"Follow-up due: {lead.title}"),
        "lead_converted": ("lead_converted", f"Lead converted: {lead.title}"),
    }
    tpl_key, subject = mapping.get(kind, ("alert", f"Lead alert: {lead.title}"))
    if recipient_id:
        notify_lead_email(db, actor_id, recipient_id, tpl_key, subject, **ctx)
