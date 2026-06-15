from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Assignment, Client, Guard, Invoice, Site
from app.services import sms_service
from app.services.company_service import get_company_by_user_id


def _guard_phone(guard: Guard) -> Optional[str]:
    for p in (guard.phone, guard.work_phone):
        if p and str(p).strip():
            return str(p).strip()
    return None


def _client_phone(client: Client) -> Optional[str]:
    if client.phone and str(client.phone).strip():
        return str(client.phone).strip()
    return None


def _safe_send(db: Session, user_id: int, recipient: Optional[str], template_key: str, **ctx) -> None:
    if not recipient:
        return
    try:
        company = get_company_by_user_id(db, user_id)
        templates = sms_service.parse_templates(company.sms_templates_json)
        tpl = templates.get(template_key) or sms_service.DEFAULT_TEMPLATES.get(template_key, "")
        body = tpl.format(**{k: str(v) for k, v in ctx.items()})
        sms_service.send_sms(db, user_id, recipient, body, template_key)
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
        _guard_phone(guard),
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
        _client_phone(client),
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
        _client_phone(client),
        "payment_reminder",
        invoice_id=inv.id,
        amount=f"£{balance:.2f}",
    )
