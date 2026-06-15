import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Company, SubscriptionReceipt, User
from app.plan_config import SUBSCRIPTION_PERIOD_DAYS, normalize_tier, price_for_tier

SIDEBAR_DEFAULT_PATHS = [
    "/dashboard",
    "/guards",
    "/sites",
    "/clients",
    "/assignments",
    "/rota",
    "/attendance",
    "/documents",
    "/contractors",
    "/payroll",
    "/invoices",
    "/expenses",
    "/reports",
    "/payments",
    "/allowances",
    "/settings/special-days",
    "/settings/roles",
    "/settings/company",
    "/settings/sms",
    "/client-portal",
    "/client-portal/request-staff",
    "/requests",
]


def _utcnow():
    return datetime.now(timezone.utc)


def generate_ref_id() -> str:
    d = _utcnow().strftime("%Y%m%d")
    return f"RCP-{d}-{secrets.token_hex(4).upper()}"


def create_receipt_for_signup(db: Session, company: Company, user: User, tier: str) -> SubscriptionReceipt:
    t = normalize_tier(tier)
    ref = generate_ref_id()
    while db.query(SubscriptionReceipt).filter(SubscriptionReceipt.ref_id == ref).first():
        ref = generate_ref_id()
    row = SubscriptionReceipt(
        ref_id=ref,
        company_id=company.id,
        user_id=user.id,
        subscription_tier=t,
        amount=price_for_tier(t),
        period_days=SUBSCRIPTION_PERIOD_DAYS,
        status="pending",
    )
    db.add(row)
    db.flush()
    return row


def latest_pending_receipt(db: Session, company_id: int) -> SubscriptionReceipt | None:
    return (
        db.query(SubscriptionReceipt)
        .filter(SubscriptionReceipt.company_id == company_id, SubscriptionReceipt.status == "pending")
        .order_by(SubscriptionReceipt.id.desc())
        .first()
    )


def receipt_by_ref(db: Session, ref_id: str) -> SubscriptionReceipt | None:
    return db.query(SubscriptionReceipt).filter(SubscriptionReceipt.ref_id == ref_id).first()


def mark_receipt_paid(db: Session, receipt_id: int) -> SubscriptionReceipt:
    r = db.query(SubscriptionReceipt).filter(SubscriptionReceipt.id == receipt_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if r.status == "paid":
        return r
    now = _utcnow()
    end = now + timedelta(days=r.period_days or SUBSCRIPTION_PERIOD_DAYS)
    r.status = "paid"
    r.paid_at = now
    r.period_start = now
    r.period_end = end
    co = db.query(Company).filter(Company.id == r.company_id).first()
    if co:
        co.subscription_status = "active"
        co.subscription_tier = r.subscription_tier
        co.subscription_start = now
        co.subscription_end = end
    db.commit()
    db.refresh(r)
    if co:
        from app.services import subscription_invoice_service
        subscription_invoice_service.create_invoice(db, co, status="paid", period_start=now, send_email=False)
        subscription_invoice_service.ensure_renewal_invoices(db)
    return r


def company_subscription_blocked(db: Session, user: User) -> dict | None:
    if not user.company_id:
        return None
    co = db.query(Company).filter(Company.id == user.company_id).first()
    if not co or co.subscription_status == "active":
        return None
    pending = latest_pending_receipt(db, co.id)
    return {
        "code": "payment_pending",
        "subscription_status": co.subscription_status or "pending",
        "receipt_ref": pending.ref_id if pending else None,
        "amount": pending.amount if pending else price_for_tier(co.subscription_tier),
        "tier": co.subscription_tier,
        "company_name": co.name,
    }


def parse_sidebar_modules(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(d, list):
        return [str(x) for x in d if isinstance(x, str)]
    return None


def dump_sidebar_modules(paths: list[str] | None) -> str | None:
    if paths is None:
        return None
    return json.dumps(paths)
