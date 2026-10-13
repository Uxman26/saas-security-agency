from datetime import date
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Invoice, Payment, User, SmsLog, EmailLog
from app.services.company_service import get_company_by_user_id
from app.services.expense_service import _expense_totals, _invoice_vat_total
from app.services.invoice_payment_service import (
    batch_invoice_settlements,
    invoice_balance_due,
)
from app.services.rota_service import rota_summary
from app.services import reports_extended_service


def reports_hub(db: Session, user_id: int, start_date: date, end_date: date) -> dict[str, Any]:
    company = get_company_by_user_id(db, user_id)
    revenue_val = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(
            Payment.company_id == company.id,
            Payment.deleted_at.is_(None),
            func.date(Payment.paid_at) >= start_date,
            func.date(Payment.paid_at) <= end_date,
        )
        .scalar()
    )
    revenue = round(float(revenue_val or 0), 2)
    open_invoices = (
        db.query(Invoice)
        .filter(
            Invoice.company_id == company.id,
            Invoice.status.notin_(("paid", "cancelled", "draft")),
        )
        .all()
    )
    settlements = batch_invoice_settlements(db, [inv.id for inv in open_invoices])
    outstanding = 0.0
    for inv in open_invoices:
        paid, credited = settlements.get(inv.id, (0.0, 0.0))
        outstanding += invoice_balance_due(db, inv, paid=paid, credited=credited)
    expense_totals = _expense_totals(db, company.id, start_date, end_date)
    invoice_vat = _invoice_vat_total(db, company.id, start_date, end_date)
    expense_vat = expense_totals["total_vat"]
    staff_hours = round(sum(r.total_hours for r in rota_summary(db, user_id, start_date, end_date)), 2)
    active_users = db.query(func.count(User.id)).filter(User.company_id == company.id, User.is_active == True).scalar()
    sms_count = db.query(func.count(SmsLog.id)).filter(SmsLog.company_id == company.id).scalar()
    email_count = db.query(func.count(EmailLog.id)).filter(EmailLog.company_id == company.id).scalar()
    return {
        "period_start": start_date,
        "period_end": end_date,
        "total_revenue": revenue,
        "outstanding_invoices": round(outstanding, 2),
        "total_expenses": expense_totals["total_inc_vat"],
        "expense_vat": expense_vat,
        "invoice_vat": invoice_vat,
        "net_vat": round(invoice_vat - expense_vat, 2),
        "active_users": int(active_users or 0),
        "staff_hours": staff_hours,
        "sms_usage": int(sms_count or 0),
        "email_usage": int(email_count or 0),
        "monthly_trends": reports_extended_service.monthly_trends(db, user_id),
        "subscription_trend": reports_extended_service.subscription_trend(db, user_id),
    }


def financial_invoice_rows(db: Session, user_id: int, start_date: date, end_date: date) -> list[dict]:
    company = get_company_by_user_id(db, user_id)
    rows = (
        db.query(Invoice)
        .filter(Invoice.company_id == company.id, Invoice.period_end >= start_date, Invoice.period_end <= end_date)
        .order_by(Invoice.id.desc())
        .all()
    )
    settlements = batch_invoice_settlements(db, [inv.id for inv in rows])
    out = []
    for inv in rows:
        paid, credited = settlements.get(inv.id, (0.0, 0.0))
        out.append(
            {
                "invoice_id": inv.id,
                "client_id": inv.client_id,
                "period_end": inv.period_end.isoformat(),
                "total": inv.total,
                "amount_paid": paid,
                "credit_applied": credited,
                "balance": invoice_balance_due(db, inv, paid=paid, credited=credited),
                "status": inv.status,
                "due_date": inv.due_date.isoformat() if inv.due_date else "",
            }
        )
    return out
