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


# Marker holding the sidebar paths that existed the last time this ran. Anything in
# MODULE_SEED but not in the marker is a module added since, which is what makes the
# "new module" case distinguishable from "the admin unticked it".
SIDEBAR_KNOWN_PATHS_KEY = "sidebar_known_paths"

# Modules shipped by the release that introduced the marker. The baseline is seeded
# without them so the very first run detects them as new and appends them to stored
# lists — clearing the backlog this mechanism exists to prevent.
_INTRODUCED_WITH_MARKER = ("/accident-reports", "/occurrence-sheets", "/tasks")


def grant_new_sidebar_paths(db) -> list[str]:
    """Add newly-shipped modules to every stored sidebar list, once.

    A stored sidebar_modules_json is an allow-list, so a module added after it was
    written is invisible to that login even when its role grants it — which is how
    Patrol, Incidents and Lone worker went missing before. Appending blindly would be
    wrong too: it would resurrect a module the admin had deliberately unticked. So only
    paths absent from the marker — genuinely new since last run — are appended, matching
    the same "nobody loses access on the deploy that introduces it" rule the action
    catalogue's ``parent`` migration follows.
    """
    import json as _json

    from app.models import PlatformSetting, User

    current = sidebar_default_paths()
    row = db.query(PlatformSetting).filter(PlatformSetting.key == SIDEBAR_KNOWN_PATHS_KEY).first()
    if row is None:
        baseline = [p for p in current if p not in _INTRODUCED_WITH_MARKER]
        row = PlatformSetting(key=SIDEBAR_KNOWN_PATHS_KEY, value=_json.dumps(baseline))
        db.add(row)
        db.flush()
    try:
        known = set(_json.loads(row.value or "[]"))
    except (ValueError, TypeError):
        known = set(current)
    added = [p for p in current if p not in known]
    if added:
        for user in db.query(User).filter(User.sidebar_modules_json.isnot(None)).all():
            stored = parse_sidebar_modules(user.sidebar_modules_json)
            if not stored:
                continue
            missing = [p for p in added if p not in stored]
            if missing:
                user.sidebar_modules_json = dump_sidebar_modules(stored + missing)
    row.value = _json.dumps(current)
    db.flush()
    return added


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
