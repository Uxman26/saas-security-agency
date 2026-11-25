from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.html_safe import esc_map
from app.models import Assignment, Client, Guard, Invoice, Site, User
from app.services import email_config_service, email_service
from app.services.company_service import get_company_by_user_id
from app.services.invoice_currency import INVOICE_CURRENCIES
from app.services.module_service import is_module_enabled
from app.services.invoice_ref import invoice_filename, invoice_label, invoice_no


def _guard_email(guard: Guard) -> Optional[str]:
    if guard.email and str(guard.email).strip():
        return str(guard.email).strip()
    return None


def _client_email(client: Client) -> Optional[str]:
    if client.email and str(client.email).strip():
        return str(client.email).strip()
    return None


def _safe_send(db: Session, user_id: int, recipient: Optional[str], subject: str, template_key: str, **ctx) -> None:
    if not recipient:
        return
    try:
        company = get_company_by_user_id(db, user_id)
        if not is_module_enabled(company, "email") or not email_service.is_company_configured(company):
            return
        templates = email_config_service.parse_templates(company.email_templates_json)
        tpl = templates.get(template_key) or email_config_service.DEFAULT_TEMPLATES.get(template_key, "")
        # Escaped: templates are HTML and the context carries site names, notes and
        # other values typed by users.
        body = tpl.format(**esc_map(ctx))
        email_service.send_and_log(db, company.id, recipient, subject, body, template_key)
    except Exception:
        pass


def notify_shift_assignment(db: Session, user_id: int, assignment: Assignment) -> None:
    guard = db.query(Guard).filter(Guard.id == assignment.guard_id).first()
    site = db.query(Site).filter(Site.id == assignment.site_id).first()
    if not guard or not site:
        return
    from app.services.attendance_service import _company_zone

    company = get_company_by_user_id(db, user_id)
    today = datetime.now(_company_zone(company)).date()
    tomorrow = today + timedelta(days=1)
    if assignment.date != tomorrow and assignment.date != today:
        return
    shift = ""
    if assignment.shift_start and assignment.shift_end:
        shift = f"{assignment.shift_start}–{assignment.shift_end}"
    _safe_send(
        db,
        user_id,
        _guard_email(guard),
        "Shift reminder",
        "shift_reminder",
        date=str(assignment.date),
        site=site.name,
        shift=shift or "scheduled",
    )


def _safe_send_invoice_email(
    db: Session, user_id: int, inv: Invoice, kind: str, balance: Optional[float] = None
) -> Optional[str]:
    """Automatic invoice / reminder email in the branded layout, never raising.

    Returns the recipient when it went out, None when it could not be sent."""
    from app.services import invoice_email

    try:
        company = get_company_by_user_id(db, user_id)
        if not is_module_enabled(company, "email") or not email_service.is_company_configured(company):
            return None
        _name, recipient = invoice_email._billed_to(inv)
        if not recipient:
            return None
        msg = invoice_email.build(db, inv, kind=kind, balance=balance)
        email_service.send_and_log(
            db,
            company.id,
            recipient,
            msg["subject"],
            msg["html"],
            "payment_reminder" if kind == "reminder" else "invoice_sent",
            msg["attachments"],
            msg["inline_images"],
        )
        return recipient
    except Exception:
        return None


def notify_invoice_sent(db: Session, user_id: int, inv: Invoice) -> None:
    _safe_send_invoice_email(db, user_id, inv, "invoice")


def notify_payment_reminder(db: Session, user_id: int, inv: Invoice, balance: float) -> Optional[str]:
    return _safe_send_invoice_email(db, user_id, inv, "reminder", balance)


def build_payment_reminder(db: Session, user_id: int, inv: Invoice, balance: float, *, preview: bool = False) -> dict:
    """The reminder email exactly as it would be sent: recipient (None if there is no
    address on record), subject, HTML body and, unless previewing, the attachments."""
    from app.services import invoice_email

    _name, recipient = invoice_email._billed_to(inv)
    msg = invoice_email.build(db, inv, kind="reminder", balance=balance, preview=preview)
    return {
        "recipient": recipient or None,
        "subject": msg["subject"],
        "body": msg["html"],
        "attachments": msg["attachments"],
        "inline_images": msg["inline_images"],
    }


def send_payment_reminder(
    db: Session, user_id: int, inv: Invoice, balance: float, to_email: Optional[str] = None
) -> str:
    """Email a reminder someone asked for and return the recipient.

    `to_email` is the address confirmed in the preview; left out, the one on record.
    Unlike the automatic notify_* helpers this raises on failure, so the person who
    clicked Send is never told an email went out when it did not.
    """
    msg = build_payment_reminder(db, user_id, inv, balance)
    recipient = (to_email or "").strip() or msg["recipient"]
    if not recipient:
        raise HTTPException(
            status_code=400,
            detail="This client has no email address. Add one to the client record first.",
        )
    if "@" not in recipient or any(c.isspace() for c in recipient):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    email_config_service.send_tenant_email(
        db, user_id, recipient, msg["subject"], msg["body"], "payment_reminder",
        msg["attachments"], msg["inline_images"],
    )
    return recipient


def notify_contract_expiry(db: Session, company_id: int, admin: User, site_name: str, end_date: date) -> None:
    _safe_send(
        db,
        admin.id,
        admin.email,
        "Contract expiry alert",
        "alert",
        message=f"Site contract for {site_name} expires on {end_date}.",
    )
