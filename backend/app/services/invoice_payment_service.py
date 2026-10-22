from datetime import date
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import CreditNote, Invoice, Payment


def invoice_amount_paid(db: Session, invoice_id: int) -> float:
    val = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.invoice_id == invoice_id, Payment.deleted_at.is_(None))
        .scalar()
    )
    return round(float(val or 0), 2)


def invoice_credit_applied(db: Session, invoice_id: int) -> float:
    from app.services.credit_note_service import invoice_credit_applied as _credits

    return _credits(db, invoice_id)


def batch_invoice_settlements(db: Session, invoice_ids: list[int]) -> dict[int, tuple[float, float]]:
    if not invoice_ids:
        return {}
    from app.services.credit_note_service import ACTIVE_STATUSES

    paid_rows = (
        db.query(Payment.invoice_id, func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.invoice_id.in_(invoice_ids), Payment.deleted_at.is_(None))
        .group_by(Payment.invoice_id)
        .all()
    )
    credit_rows = (
        db.query(CreditNote.invoice_id, func.coalesce(func.sum(CreditNote.total), 0))
        .filter(
            CreditNote.invoice_id.in_(invoice_ids),
            CreditNote.status.in_(ACTIVE_STATUSES),
            CreditNote.deleted_at.is_(None),
        )
        .group_by(CreditNote.invoice_id)
        .all()
    )
    paid_map = {int(i): round(float(v or 0), 2) for i, v in paid_rows}
    cred_map = {int(i): round(float(v or 0), 2) for i, v in credit_rows}
    return {i: (paid_map.get(i, 0.0), cred_map.get(i, 0.0)) for i in invoice_ids}


def invoice_settled_amount(db: Session, invoice_id: int) -> float:
    return round(invoice_amount_paid(db, invoice_id) + invoice_credit_applied(db, invoice_id), 2)


def invoice_balance_due(
    db: Session,
    inv: Invoice,
    *,
    paid: Optional[float] = None,
    credited: Optional[float] = None,
) -> float:
    total = round(float(inv.total or 0), 2)
    if paid is None or credited is None:
        settled = invoice_settled_amount(db, inv.id)
    else:
        settled = round(float(paid) + float(credited), 2)
    return round(max(0, total - settled), 2)


def sync_invoice_payment_status(db: Session, inv: Invoice, user_id: Optional[int] = None) -> str:
    if inv.status in ("draft", "cancelled"):
        return inv.status
    prev = inv.status
    paid = invoice_amount_paid(db, inv.id)
    credited = invoice_credit_applied(db, inv.id)
    settled = round(paid + credited, 2)
    total = round(float(inv.total or 0), 2)
    if total <= 0:
        return inv.status
    if settled >= total:
        inv.status = "paid"
    elif settled > 0:
        inv.status = "partial"
    elif inv.due_date and inv.due_date < date.today():
        inv.status = "overdue"
    elif prev == "unpaid":
        inv.status = "unpaid"
    else:
        # Sent, paid, partial, overdue, or the legacy "issued" value all return
        # to a collectable issued state once every payment and credit is gone.
        inv.status = "sent"
    if user_id and inv.status == "overdue" and prev != "overdue":
        from app.services import sms_trigger_service, email_trigger_service
        balance = round(max(0, total - settled), 2)
        sms_trigger_service.notify_payment_reminder(db, user_id, inv, balance)
        email_trigger_service.notify_payment_reminder(db, user_id, inv, balance)
    return inv.status
