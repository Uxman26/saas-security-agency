import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import get_password_hash
from app.models import Company, SubscriptionReceipt, User
from app.services.receipt_service import SIDEBAR_DEFAULT_PATHS, dump_sidebar_modules, parse_sidebar_modules

ADMIN_ROLES = frozenset({"admin", "company_admin"})


def _utcnow():
    return datetime.now(timezone.utc)


def list_receipts(db: Session) -> list[SubscriptionReceipt]:
    return (
        db.query(SubscriptionReceipt)
        .options(joinedload(SubscriptionReceipt.company), joinedload(SubscriptionReceipt.user))
        .order_by(SubscriptionReceipt.id.desc())
        .all()
    )


def list_tenant_admins(db: Session) -> list[User]:
    admin_ids = {c.admin_id for c in db.query(Company).all()}
    rows = db.query(User).filter(User.company_id.isnot(None)).order_by(User.id.desc()).all()
    return [u for u in rows if u.id in admin_ids or (u.role or "").lower() in ADMIN_ROLES]


def get_admin_detail(db: Session, user_id: int) -> tuple[User, Company | None, list[SubscriptionReceipt]]:
    u = db.query(User).filter(User.id == user_id).first()
    if not u or not u.company_id:
        raise HTTPException(status_code=404, detail="Admin not found")
    co = db.query(Company).filter(Company.id == u.company_id).first()
    receipts = (
        db.query(SubscriptionReceipt)
        .filter(SubscriptionReceipt.company_id == u.company_id)
        .order_by(SubscriptionReceipt.id.desc())
        .all()
    )
    return u, co, receipts


def reset_admin_password(db: Session, user_id: int, new_password: str) -> User:
    u, _, _ = get_admin_detail(db, user_id)
    u.password_hash = get_password_hash(new_password)
    db.commit()
    db.refresh(u)
    return u


def set_sidebar_modules(db: Session, user_id: int, paths: list[str]) -> User:
    u, _, _ = get_admin_detail(db, user_id)
    valid = set(SIDEBAR_DEFAULT_PATHS)
    cleaned = [p for p in paths if p in valid]
    if "/dashboard" not in cleaned:
        cleaned.insert(0, "/dashboard")
    u.sidebar_modules_json = dump_sidebar_modules(cleaned)
    db.commit()
    db.refresh(u)
    return u


def admin_out(db: Session, u: User, co: Company | None, receipts: list[SubscriptionReceipt]) -> dict:
    days_left = None
    if co and co.subscription_end:
        end = co.subscription_end
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        days_left = max(0, (end - _utcnow()).days)
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "is_active": u.is_active,
        "created_at": u.created_at,
        "company_id": u.company_id,
        "company_name": co.name if co else None,
        "subscription_tier": co.subscription_tier if co else None,
        "subscription_status": co.subscription_status if co else None,
        "subscription_start": co.subscription_start if co else None,
        "subscription_end": co.subscription_end if co else None,
        "subscription_days_left": days_left,
        "sidebar_modules": parse_sidebar_modules(u.sidebar_modules_json) or SIDEBAR_DEFAULT_PATHS,
        "receipts": [
            {
                "id": r.id,
                "ref_id": r.ref_id,
                "amount": r.amount,
                "subscription_tier": r.subscription_tier,
                "status": r.status,
                "period_start": r.period_start,
                "period_end": r.period_end,
                "paid_at": r.paid_at,
                "created_at": r.created_at,
            }
            for r in receipts
        ],
    }
