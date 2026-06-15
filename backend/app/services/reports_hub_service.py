from datetime import date
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Invoice, User, SmsLog
from app.services.company_service import get_company_by_user_id
from app.services.expense_service import _expense_totals, _invoice_vat_total
from app.services.invoice_payment_service import invoice_amount_paid
from app.services.rota_service import rota_summary


def reports_hub(db: Session, user_id: int, start_date: date, end_date: date) -> dict[str, Any]:
    company = get_company_by_user_id(db, user_id)
    invoices = db.query(Invoice).filter(Invoice.company_id == company.id).all()
    revenue = 0.0
    outstanding = 0.0
    for inv in invoices:
        paid = invoice_amount_paid(db, inv.id)
        revenue += paid
        if inv.status not in ("paid", "cancelled", "draft"):
            outstanding += max(0, float(inv.total or 0) - paid)
    expense_totals = _expense_totals(db, company.id, start_date, end_date)
    invoice_vat = _invoice_vat_total(db, company.id, start_date, end_date)
    expense_vat = expense_totals["total_vat"]
    staff_hours = round(sum(r.total_hours for r in rota_summary(db, user_id, start_date, end_date)), 2)
    active_users = db.query(func.count(User.id)).filter(User.company_id == company.id, User.is_active == True).scalar()
    sms_count = db.query(func.count(SmsLog.id)).filter(SmsLog.company_id == company.id).scalar()
    return {
        "period_start": start_date,
        "period_end": end_date,
        "total_revenue": round(revenue, 2),
        "outstanding_invoices": round(outstanding, 2),
        "total_expenses": expense_totals["total_inc_vat"],
        "expense_vat": expense_vat,
        "invoice_vat": invoice_vat,
        "net_vat": round(invoice_vat - expense_vat, 2),
        "active_users": int(active_users or 0),
        "staff_hours": staff_hours,
        "sms_usage": int(sms_count or 0),
        "email_usage": 0,
    }


def financial_invoice_rows(db: Session, user_id: int, start_date: date, end_date: date) -> list[dict]:
    company = get_company_by_user_id(db, user_id)
    rows = (
        db.query(Invoice)
        .filter(Invoice.company_id == company.id, Invoice.period_end >= start_date, Invoice.period_end <= end_date)
        .order_by(Invoice.id.desc())
        .all()
    )
    out = []
    for inv in rows:
        paid = invoice_amount_paid(db, inv.id)
        out.append(
            {
                "invoice_id": inv.id,
                "client_id": inv.client_id,
                "period_end": inv.period_end.isoformat(),
                "total": inv.total,
                "amount_paid": paid,
                "balance": round(max(0, float(inv.total or 0) - paid), 2),
                "status": inv.status,
                "due_date": inv.due_date.isoformat() if inv.due_date else "",
            }
        )
    return out
