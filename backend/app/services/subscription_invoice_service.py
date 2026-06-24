import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import Company, SubscriptionInvoice, User
from app.plan_config import normalize_tier, price_for_tier
from app.services import email_service

VAT_RATE = 0.20
BILLING_CYCLES = {
    "monthly": {"days": 30, "multiplier": 1},
    "quarterly": {"days": 90, "multiplier": 3},
    "yearly": {"days": 365, "multiplier": 12},
}


def _utcnow():
    return datetime.now(timezone.utc)


def _cycle_info(cycle: str) -> dict:
    return BILLING_CYCLES.get(cycle or "monthly", BILLING_CYCLES["monthly"])


def _calc_amounts(tier: str, cycle: str) -> tuple[float, float, float]:
    info = _cycle_info(cycle)
    ex = round(price_for_tier(tier) * info["multiplier"], 2)
    vat = round(ex * VAT_RATE, 2)
    return ex, vat, round(ex + vat, 2)


def _invoice_number(db: Session) -> str:
    d = _utcnow().strftime("%Y%m%d")
    for _ in range(10):
        num = f"SUB-{d}-{secrets.token_hex(3).upper()}"
        if not db.query(SubscriptionInvoice).filter(SubscriptionInvoice.invoice_number == num).first():
            return num
    return f"SUB-{d}-{secrets.token_hex(4).upper()}"


def _sync_status(inv: SubscriptionInvoice) -> str:
    if inv.status == "cancelled":
        return inv.status
    paid = float(inv.amount_paid or 0)
    total = float(inv.total_amount or 0)
    if paid >= total and total > 0:
        return "paid"
    if paid > 0:
        return "partial"
    due = inv.due_date
    if due and due < date.today():
        return "overdue"
    return "unpaid"


def _serialize(inv: SubscriptionInvoice, db: Session) -> dict:
    co = inv.company or db.query(Company).filter(Company.id == inv.company_id).first()
    admin = db.query(User).filter(User.id == co.admin_id).first() if co else None
    status = _sync_status(inv)
    if status != inv.status:
        inv.status = status
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "company_id": inv.company_id,
        "company_name": co.name if co else None,
        "tenant_email": admin.email if admin else co.email if co else None,
        "subscription_tier": inv.subscription_tier,
        "billing_cycle": inv.billing_cycle,
        "period_start": inv.period_start,
        "period_end": inv.period_end,
        "due_date": inv.due_date,
        "amount_ex_vat": inv.amount_ex_vat,
        "vat_amount": inv.vat_amount,
        "total_amount": inv.total_amount,
        "amount_paid": inv.amount_paid or 0,
        "status": status,
        "email_sent": bool(inv.email_sent),
        "sent_at": inv.sent_at,
        "paid_at": inv.paid_at,
        "created_at": inv.created_at,
    }


def _email_body(inv: SubscriptionInvoice, co: Company) -> str:
    return (
        f"<div style='font-family:sans-serif;max-width:600px'>"
        f"<h2 style='color:#1e293b'>Subscription Invoice</h2>"
        f"<p>Hi {co.name},</p>"
        f"<p>Your ControlOps subscription invoice is ready.</p>"
        f"<table style='width:100%;border-collapse:collapse;margin:16px 0'>"
        f"<tr><td style='padding:8px;border-bottom:1px solid #e2e8f0'>Invoice</td>"
        f"<td style='padding:8px;border-bottom:1px solid #e2e8f0'><strong>{inv.invoice_number}</strong></td></tr>"
        f"<tr><td style='padding:8px;border-bottom:1px solid #e2e8f0'>Plan</td>"
        f"<td style='padding:8px;border-bottom:1px solid #e2e8f0'>{inv.subscription_tier.title()} ({inv.billing_cycle})</td></tr>"
        f"<tr><td style='padding:8px;border-bottom:1px solid #e2e8f0'>Due date</td>"
        f"<td style='padding:8px;border-bottom:1px solid #e2e8f0'>{inv.due_date}</td></tr>"
        f"<tr><td style='padding:8px;border-bottom:1px solid #e2e8f0'>Amount ex VAT</td>"
        f"<td style='padding:8px;border-bottom:1px solid #e2e8f0'>£{inv.amount_ex_vat:.2f}</td></tr>"
        f"<tr><td style='padding:8px;border-bottom:1px solid #e2e8f0'>VAT (20%)</td>"
        f"<td style='padding:8px;border-bottom:1px solid #e2e8f0'>£{inv.vat_amount:.2f}</td></tr>"
        f"<tr><td style='padding:8px'><strong>Total payable</strong></td>"
        f"<td style='padding:8px'><strong>£{inv.total_amount:.2f}</strong></td></tr>"
        f"</table>"
        f"<p>Please arrange payment by the due date to keep your subscription active.</p>"
        f"</div>"
    )


def send_invoice_email(db: Session, inv: SubscriptionInvoice) -> bool:
    co = db.query(Company).filter(Company.id == inv.company_id).first()
    if not co:
        return False
    admin = db.query(User).filter(User.id == co.admin_id).first()
    to = (admin.email if admin else None) or co.email
    if not to:
        return False
    if not settings.mail_username or not settings.mail_password:
        return False
    ok = email_service.send_email(to, f"Subscription Invoice {inv.invoice_number}", _email_body(inv, co))
    if ok:
        inv.email_sent = True
        inv.sent_at = _utcnow()
        db.commit()
    return ok


def create_invoice(
    db: Session,
    company: Company,
    *,
    status: str = "unpaid",
    period_start: Optional[datetime] = None,
    send_email: bool = True,
) -> SubscriptionInvoice:
    cycle = company.billing_cycle or "monthly"
    info = _cycle_info(cycle)
    tier = normalize_tier(company.subscription_tier)
    ex, vat, total = _calc_amounts(tier, cycle)
    start = period_start or company.subscription_start or _utcnow()
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    end = start + timedelta(days=info["days"])
    due = (end.date() if hasattr(end, "date") else date.today()) + timedelta(days=7)
    inv = SubscriptionInvoice(
        invoice_number=_invoice_number(db),
        company_id=company.id,
        subscription_tier=tier,
        billing_cycle=cycle,
        period_start=start,
        period_end=end,
        due_date=due,
        amount_ex_vat=ex,
        vat_amount=vat,
        total_amount=total,
        amount_paid=total if status == "paid" else 0,
        status=status,
        paid_at=_utcnow() if status == "paid" else None,
    )
    db.add(inv)
    db.flush()
    if send_email and status != "paid":
        send_invoice_email(db, inv)
    db.commit()
    db.refresh(inv)
    return inv


def ensure_renewal_invoices(db: Session) -> int:
    created = 0
    now = _utcnow()
    companies = db.query(Company).filter(Company.subscription_status == "active").all()
    for co in companies:
        if not co.subscription_end:
            continue
        end = co.subscription_end
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if (end - now).days > 14:
            continue
        open_inv = (
            db.query(SubscriptionInvoice)
            .filter(
                SubscriptionInvoice.company_id == co.id,
                SubscriptionInvoice.status.in_(["unpaid", "overdue", "partial"]),
            )
            .first()
        )
        if open_inv:
            continue
        create_invoice(db, co, period_start=end, send_email=True)
        created += 1
    return created


def list_invoices(db: Session, company_id: Optional[int] = None, status: Optional[str] = None) -> list[dict]:
    q = db.query(SubscriptionInvoice).options(joinedload(SubscriptionInvoice.company)).order_by(SubscriptionInvoice.id.desc())
    if company_id:
        q = q.filter(SubscriptionInvoice.company_id == company_id)
    rows = q.all()
    out = []
    for inv in rows:
        data = _serialize(inv, db)
        if status and data["status"] != status:
            continue
        out.append(data)
    db.commit()
    return out


def get_invoice(db: Session, invoice_id: int) -> dict:
    inv = (
        db.query(SubscriptionInvoice)
        .options(joinedload(SubscriptionInvoice.company))
        .filter(SubscriptionInvoice.id == invoice_id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    data = _serialize(inv, db)
    db.commit()
    db.refresh(inv)
    return data


def set_invoice_status(db: Session, invoice_id: int, status: str) -> dict:
    valid = {"paid", "unpaid", "overdue", "partial", "cancelled"}
    if status not in valid:
        raise HTTPException(status_code=400, detail="Invalid status")
    inv = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv.status = status
    if status == "paid":
        inv.amount_paid = inv.total_amount
        inv.paid_at = _utcnow()
        co = db.query(Company).filter(Company.id == inv.company_id).first()
        if co and inv.period_end:
            co.subscription_end = inv.period_end
            co.subscription_status = "active"
    elif status == "cancelled":
        inv.amount_paid = 0
        inv.paid_at = None
    db.commit()
    db.refresh(inv)
    return get_invoice(db, invoice_id)


def record_payment(db: Session, invoice_id: int, amount: float) -> dict:
    inv = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv.amount_paid = round(float(inv.amount_paid or 0) + max(0, amount), 2)
    inv.status = _sync_status(inv)
    if inv.status == "paid":
        inv.paid_at = _utcnow()
        co = db.query(Company).filter(Company.id == inv.company_id).first()
        if co and inv.period_end:
            co.subscription_end = inv.period_end
            co.subscription_status = "active"
    db.commit()
    return get_invoice(db, invoice_id)


def dashboard_stats(db: Session) -> dict:
    invoices = db.query(SubscriptionInvoice).all()
    for inv in invoices:
        inv.status = _sync_status(inv)
    db.commit()
    total = len(invoices)
    paid = sum(1 for i in invoices if i.status == "paid")
    unpaid = sum(1 for i in invoices if i.status == "unpaid")
    overdue = sum(1 for i in invoices if i.status == "overdue")
    partial = sum(1 for i in invoices if i.status == "partial")
    outstanding = round(
        sum(max(0, float(i.total_amount or 0) - float(i.amount_paid or 0)) for i in invoices if i.status != "cancelled"),
        2,
    )
    collected = round(sum(float(i.amount_paid or 0) for i in invoices), 2)
    companies = db.query(Company).count()
    active = db.query(Company).filter(Company.subscription_status == "active").count()
    return {
        "total_companies": companies,
        "active_subscriptions": active,
        "total_invoices": total,
        "paid_invoices": paid,
        "unpaid_invoices": unpaid,
        "overdue_invoices": overdue,
        "partial_invoices": partial,
        "outstanding_balance": outstanding,
        "total_collected": collected,
    }
