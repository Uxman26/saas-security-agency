import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import get_password_hash, SUPER_ADMIN_ROLE
from app.models import Company, Invoice, InvoiceLine, Payment, SubscriptionReceipt, User
from app.services.receipt_service import SIDEBAR_DEFAULT_PATHS, dump_sidebar_modules, parse_sidebar_modules
from app.services.module_service import dump_modules, parse_modules
from app.schemas import InvoiceUpdate

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


def list_all_users(db: Session) -> list[dict[str, Any]]:
    companies = {c.id: c for c in db.query(Company).all()}
    rows = db.query(User).order_by(User.id.desc()).all()
    out = []
    for u in rows:
        co = companies.get(u.company_id) if u.company_id else None
        out.append(
            {
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
            }
        )
    return out


def set_user_active(db: Session, user_id: int, is_active: bool) -> User:
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if getattr(u, "role", None) == SUPER_ADMIN_ROLE and not is_active:
        raise HTTPException(status_code=400, detail="Cannot deactivate super admin")
    u.is_active = is_active
    db.commit()
    db.refresh(u)
    return u


def update_company(db: Session, company_id: int, payload: dict[str, Any]) -> Company:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    modules = payload.pop("enabled_modules", None)
    if modules is not None:
        co.enabled_modules_json = dump_modules(modules)
    for k, v in payload.items():
        if hasattr(co, k) and v is not None:
            setattr(co, k, v)
    db.commit()
    db.refresh(co)
    return co


def company_admin_out(db: Session, co: Company) -> dict:
    from app.services.tenant_usage_service import company_usage, user_limit_for_company
    from sqlalchemy import func

    user_count = db.query(func.count(User.id)).filter(User.company_id == co.id, User.is_active == True).scalar()
    return {
        "id": co.id,
        "name": co.name,
        "admin_id": co.admin_id,
        "subscription_tier": co.subscription_tier,
        "subscription_status": co.subscription_status,
        "subscription_start": co.subscription_start,
        "subscription_end": co.subscription_end,
        "billing_cycle": co.billing_cycle or "monthly",
        "max_users": user_limit_for_company(co),
        "user_count": int(user_count or 0),
        "enabled_modules": parse_modules(co.enabled_modules_json),
        "usage": company_usage(db, co.id),
        "created_at": co.created_at,
    }


def list_all_invoices(db: Session, company_id: Optional[int] = None, status: Optional[str] = None) -> list[Invoice]:
    q = (
        db.query(Invoice)
        .options(joinedload(Invoice.client), joinedload(Invoice.company))
        .order_by(Invoice.created_at.desc())
    )
    if company_id:
        q = q.filter(Invoice.company_id == company_id)
    if status:
        q = q.filter(Invoice.status == status)
    return q.all()


def get_invoice_admin(db: Session, invoice_id: int) -> Invoice:
    inv = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.lines).joinedload(InvoiceLine.site),
            joinedload(Invoice.lines).joinedload(InvoiceLine.guard),
            joinedload(Invoice.client),
            joinedload(Invoice.company),
        )
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


def update_invoice_admin(db: Session, invoice_id: int, data: InvoiceUpdate) -> Invoice:
    from app.services import invoice_service

    inv = get_invoice_admin(db, invoice_id)
    admin = db.query(User).filter(User.id == inv.company.admin_id).first() if inv.company else None
    user_id = admin.id if admin else inv.company.admin_id
    return invoice_service.update_invoice(db, invoice_id, data, user_id)


def set_invoice_status_admin(db: Session, invoice_id: int, status: str) -> Invoice:
    from app.services import invoice_service

    inv = get_invoice_admin(db, invoice_id)
    admin = db.query(User).filter(User.id == inv.company.admin_id).first() if inv.company else None
    user_id = admin.id if admin else inv.company.admin_id
    return invoice_service.update_invoice_status(db, invoice_id, status, user_id)


def list_all_payments(db: Session, company_id: Optional[int] = None) -> list[dict[str, Any]]:
    q = db.query(Payment).options(joinedload(Payment.invoice), joinedload(Payment.company)).order_by(Payment.paid_at.desc())
    if company_id:
        q = q.filter(Payment.company_id == company_id)
    rows = q.all()
    out = []
    for p in rows:
        out.append(
            {
                "id": p.id,
                "company_id": p.company_id,
                "invoice_id": p.invoice_id,
                "amount": p.amount,
                "method": p.method,
                "paid_at": p.paid_at,
                "created_at": p.created_at,
                "company_name": p.company.name if p.company else None,
                "invoice_total": p.invoice.total if p.invoice else None,
            }
        )
    return out


def get_admin_detail(db: Session, user_id: int) -> tuple[User, Company | None, list[SubscriptionReceipt]]:
    u = db.query(User).filter(User.id == user_id).first()
    if not u or not u.company_id:
        raise HTTPException(status_code=404, detail="Admin not found")
    if u.id not in {c.admin_id for c in db.query(Company).all()} and (u.role or "").lower() not in ADMIN_ROLES:
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
    from app.services.tenant_usage_service import company_usage, user_limit_for_company
    from app.services.module_service import parse_modules
    from sqlalchemy import func

    usage = company_usage(db, co.id) if co else {}
    user_count = (
        db.query(func.count(User.id)).filter(User.company_id == co.id, User.is_active == True).scalar()
        if co
        else 0
    )
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
        "billing_cycle": co.billing_cycle if co else None,
        "max_users": user_limit_for_company(co) if co else None,
        "user_count": int(user_count or 0),
        "enabled_modules": parse_modules(co.enabled_modules_json) if co else {},
        "usage": usage,
        "sidebar_modules": parse_sidebar_modules(u.sidebar_modules_json) or SIDEBAR_DEFAULT_PATHS,
        "receipts": [
            {
                "id": r.id,
                "ref_id": r.ref_id,
                "company_id": r.company_id,
                "company_name": co.name if co else None,
                "user_email": u.email,
                "subscription_tier": r.subscription_tier,
                "amount": r.amount,
                "period_days": r.period_days,
                "status": r.status,
                "period_start": r.period_start,
                "period_end": r.period_end,
                "paid_at": r.paid_at,
                "created_at": r.created_at,
            }
            for r in receipts
        ],
    }
