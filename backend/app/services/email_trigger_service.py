from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.html_safe import esc_map
from app.models import Assignment, Client, Guard, Invoice, Site, User
from app.services import email_config_service, email_service
from app.services.company_service import get_company_by_user_id
from app.services.module_service import is_module_enabled


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
    tomorrow = date.today() + timedelta(days=1)
    if assignment.date != tomorrow and assignment.date != date.today():
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


def notify_invoice_sent(db: Session, user_id: int, inv: Invoice) -> None:
    client = db.query(Client).filter(Client.id == inv.client_id).first()
    if not client:
        return
    _safe_send(
        db,
        user_id,
        _client_email(client),
        f"Invoice #{inv.id}",
        "invoice_sent",
        invoice_id=inv.id,
        amount=f"£{float(inv.total or 0):.2f}",
        due_date=str(inv.due_date or ""),
    )


def notify_payment_reminder(db: Session, user_id: int, inv: Invoice, balance: float) -> None:
    client = db.query(Client).filter(Client.id == inv.client_id).first()
    if not client:
        return
    _safe_send(
        db,
        user_id,
        _client_email(client),
        f"Payment reminder — invoice #{inv.id}",
        "payment_reminder",
        invoice_id=inv.id,
        amount=f"£{balance:.2f}",
    )


def notify_contract_expiry(db: Session, company_id: int, admin: User, site_name: str, end_date: date) -> None:
    _safe_send(
        db,
        admin.id,
        admin.email,
        "Contract expiry alert",
        "alert",
        message=f"Site contract for {site_name} expires on {end_date}.",
    )
