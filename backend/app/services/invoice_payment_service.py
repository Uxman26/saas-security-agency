from datetime import date
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Invoice, Payment


def invoice_amount_paid(db: Session, invoice_id: int) -> float:
    val = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.invoice_id == invoice_id)
        .scalar()
    )
    return round(float(val or 0), 2)


def sync_invoice_payment_status(db: Session, inv: Invoice, user_id: Optional[int] = None) -> str:
    if inv.status == "draft":
        return inv.status
    if inv.status == "cancelled":
        return inv.status
    prev = inv.status
    paid = invoice_amount_paid(db, inv.id)
    total = round(float(inv.total or 0), 2)
    if total <= 0:
        return inv.status
    if paid >= total:
        inv.status = "paid"
    elif paid > 0:
        inv.status = "partial"
    elif inv.status == "paid":
        inv.status = "sent"
    elif inv.due_date and inv.due_date < date.today() and inv.status in ("sent", "unpaid", "overdue"):
        inv.status = "overdue"
    elif inv.status not in ("sent", "unpaid", "overdue", "partial") and inv.status != "draft":
        inv.status = "unpaid" if inv.status not in ("sent",) else inv.status
    if user_id and inv.status == "overdue" and prev != "overdue":
        from app.services import sms_trigger_service, email_trigger_service
        balance = round(max(0, total - paid), 2)
        sms_trigger_service.notify_payment_reminder(db, user_id, inv, balance)
        email_trigger_service.notify_payment_reminder(db, user_id, inv, balance)
    return inv.status
