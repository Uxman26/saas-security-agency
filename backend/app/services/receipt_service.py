import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Company, SubscriptionReceipt, User
from app.plan_config import SUBSCRIPTION_PERIOD_DAYS, normalize_tier, price_for_tier
from app.services.module_service import apply_plan_module_flags

# Sidebar entries that are a sub-page of a module rather than a module of their own,
# so they have no MODULE_SEED row to be derived from.
_EXTRA_SIDEBAR_PATHS = ("/client-portal/request-staff",)


def sidebar_default_paths() -> list[str]:
    """Every sidebar path the super-admin picker may grant, in sidebar order.

    Derived from MODULE_SEED rather than hand-listed. This was a static list, and it
    fell behind the module registry: Patrol, Incidents, Lone worker, Leads,
    Sub-contractors, Billing and My portal all shipped after it was written. Because
    set_sidebar_modules filters incoming paths against it, ticking any of those saved a
    200 and then silently dropped them — the boxes came back unticked and the tenant
    lost the sidebar entry, since a stored list acts as an allow-list. Deriving it means
    a new module row can never fall out of the picker again.
    """
    from app.services.module_service import MODULE_SEED

    paths: list[str] = []
    for _key, _name, _icon, path, _order, _section in sorted(MODULE_SEED, key=lambda m: m[4]):
        # A module with an empty sidebar_path is permission-only and is never a link.
        if path and path not in paths:
            paths.append(path)
    for p in _EXTRA_SIDEBAR_PATHS:
        if p not in paths:
            paths.append(p)
    return paths


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
        apply_plan_module_flags(co, r.subscription_tier)
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
