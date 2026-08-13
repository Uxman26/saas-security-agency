from calendar import monthrange
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    ApiUsageLog,
    EmailLog,
    LoginLog,
    Payment,
    SmsLog,
    SubscriptionInvoice,
)
from app.services.company_service import get_company_by_user_id
from app.services.expense_service import _expense_totals
from app.services.rota_service import rota_summary
from app.services import subscription_invoice_service as sub_inv


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def _month_end(d: date) -> date:
    return date(d.year, d.month, monthrange(d.year, d.month)[1])


def _month_label(d: date) -> str:
    return d.strftime("%b %Y")


def monthly_trends(db: Session, user_id: int, months: int = 6) -> list[dict[str, Any]]:
    company = get_company_by_user_id(db, user_id)
    today = date.today()
    out = []
    for i in range(months - 1, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        start = date(y, m, 1)
        end = _month_end(start)
        rev = (
            db.query(func.coalesce(func.sum(Payment.amount), 0))
            .filter(Payment.company_id == company.id, func.date(Payment.paid_at) >= start, func.date(Payment.paid_at) <= end)
            .scalar()
        )
        exp = _expense_totals(db, company.id, start, end)["total_inc_vat"]
        hours = round(sum(r.total_hours for r in rota_summary(db, user_id, start, end)), 2)
        out.append({"label": _month_label(start), "revenue": round(float(rev or 0), 2), "expenses": exp, "staff_hours": hours})
    return out


def subscription_trend(db: Session, user_id: int, months: int = 6) -> list[dict[str, Any]]:
    company = get_company_by_user_id(db, user_id)
    today = date.today()
    out = []
    for i in range(months - 1, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        start = date(y, m, 1)
        end = _month_end(start)
        amt = (
            db.query(func.coalesce(func.sum(SubscriptionInvoice.total_amount), 0))
            .filter(
                SubscriptionInvoice.company_id == company.id,
                func.date(SubscriptionInvoice.created_at) >= start,
                func.date(SubscriptionInvoice.created_at) <= end,
            )
            .scalar()
        )
        cnt = (
            db.query(func.count(SubscriptionInvoice.id))
            .filter(
                SubscriptionInvoice.company_id == company.id,
                func.date(SubscriptionInvoice.created_at) >= start,
                func.date(SubscriptionInvoice.created_at) <= end,
            )
            .scalar()
        )
        out.append({"label": _month_label(start), "amount": round(float(amt or 0), 2), "invoices": int(cnt or 0)})
    return out


def subscription_summary(db: Session, user_id: int) -> dict[str, Any]:
    company = get_company_by_user_id(db, user_id)
    invoices = sub_inv.list_invoices(db, company.id)
    active = company.subscription_status in ("active", "paid", "trial")
    end = company.subscription_end
    days_left = None
    expiring = False
    if end:
        if hasattr(end, "date"):
            end_d = end.date()
        else:
            end_d = end
        days_left = (end_d - date.today()).days
        expiring = 0 <= days_left <= 30
    paid_total = sum(float(i.get("amount_paid") or 0) for i in invoices)
    outstanding = sum(
        max(0, float(i.get("total_amount") or 0) - float(i.get("amount_paid") or 0))
        for i in invoices
        if i.get("status") not in ("paid", "cancelled")
    )
    return {
        "subscription_tier": company.subscription_tier,
        "subscription_status": company.subscription_status,
        "billing_cycle": company.billing_cycle or "monthly",
        "subscription_end": end.isoformat() if end else None,
        "days_until_expiry": days_left,
        "is_active": active,
        "is_expiring": expiring,
        "invoice_count": len(invoices),
        "total_billed": round(sum(float(i.get("total_amount") or 0) for i in invoices), 2),
        "total_paid": round(paid_total, 2),
        "outstanding": round(outstanding, 2),
    }


def subscription_invoice_rows(db: Session, user_id: int, start_date: date, end_date: date) -> list[dict]:
    company = get_company_by_user_id(db, user_id)
    rows = sub_inv.list_invoices(db, company.id)
    out = []
    for r in rows:
        created = r.get("created_at")
        if created:
            cd = created.date() if hasattr(created, "date") else date.fromisoformat(str(created)[:10])
            if cd < start_date or cd > end_date:
                continue
        out.append(
            {
                "invoice_number": r.get("invoice_number"),
                "tier": r.get("subscription_tier"),
                "billing_cycle": r.get("billing_cycle"),
                "total": r.get("total_amount"),
                "amount_paid": r.get("amount_paid"),
                "status": r.get("status"),
                "due_date": str(r.get("due_date") or ""),
                "created_at": str(created)[:10] if created else "",
            }
        )
    return out


def login_report_rows(db: Session, user_id: int, start_date: date, end_date: date) -> list[dict]:
    company = get_company_by_user_id(db, user_id)
    rows = (
        db.query(LoginLog)
        .filter(
            LoginLog.company_id == company.id,
            func.date(LoginLog.login_at) >= start_date,
            func.date(LoginLog.login_at) <= end_date,
        )
        .order_by(LoginLog.id.desc())
        .limit(500)
        .all()
    )
    return [
        {
            "email": r.email or "",
            "full_name": r.full_name or "",
            "status": r.status,
            "ip_address": r.ip_address or "",
            "login_at": r.login_at.isoformat() if r.login_at else "",
        }
        for r in rows
    ]


def usage_summary(db: Session, user_id: int, start_date: date, end_date: date) -> dict[str, Any]:
    company = get_company_by_user_id(db, user_id)
    sms = (
        db.query(func.count(SmsLog.id))
        .filter(SmsLog.company_id == company.id, func.date(SmsLog.sent_at) >= start_date, func.date(SmsLog.sent_at) <= end_date)
        .scalar()
    )
    email = (
        db.query(func.count(EmailLog.id))
        .filter(EmailLog.company_id == company.id, func.date(EmailLog.sent_at) >= start_date, func.date(EmailLog.sent_at) <= end_date)
        .scalar()
    )
    logins = (
        db.query(func.count(LoginLog.id))
        .filter(
            LoginLog.company_id == company.id,
            LoginLog.status == "success",
            func.date(LoginLog.login_at) >= start_date,
            func.date(LoginLog.login_at) <= end_date,
        )
        .scalar()
    )
    # Half-open range on the raw column rather than date(logged_at), which wraps the
    # column in a function and so cannot use an index — this counted by scanning every
    # row in the table. `< end_date + 1 day` selects exactly the same rows as
    # `date(logged_at) <= end_date`: the whole of the end day, boundary included.
    api = (
        db.query(func.count(ApiUsageLog.id))
        .filter(
            ApiUsageLog.company_id == company.id,
            ApiUsageLog.logged_at >= start_date,
            ApiUsageLog.logged_at < end_date + timedelta(days=1),
        )
        .scalar()
    )
    from app.services.tenant_usage_service import company_usage

    usage = company_usage(db, company.id)
    return {
        "period_start": start_date,
        "period_end": end_date,
        "sms_sent": int(sms or 0),
        "emails_sent": int(email or 0),
        "successful_logins": int(logins or 0),
        "api_requests": int(api or 0),
        "active_users": usage.get("active_users", 0),
        "storage_mb": usage.get("storage_mb", 0),
    }
