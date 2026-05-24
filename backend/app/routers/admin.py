from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from typing import List
from app.database import get_db
from app.models import User, Company, SubscriptionReceipt
from app.schemas import (
    CompanyResponse,
    SubscriptionReceiptResponse,
    AdminResetPassword,
    AdminSidebarPatch,
    AdminUserDetail,
)
from app.auth import get_current_super_admin
from app.services import admin_platform_service as ap
from app.services.receipt_service import mark_receipt_paid

router = APIRouter(prefix="/admin", tags=["admin"])


def _receipt_row(r: SubscriptionReceipt, db: Session) -> SubscriptionReceiptResponse:
    co = db.query(Company).filter(Company.id == r.company_id).first()
    u = r.user
    return SubscriptionReceiptResponse(
        id=r.id,
        ref_id=r.ref_id,
        company_id=r.company_id,
        company_name=co.name if co else None,
        user_email=u.email if u else None,
        subscription_tier=r.subscription_tier,
        amount=r.amount,
        period_days=r.period_days,
        status=r.status,
        period_start=r.period_start,
        period_end=r.period_end,
        paid_at=r.paid_at,
        created_at=r.created_at,
    )


@router.get("/companies", response_model=List[CompanyResponse])
def list_all_companies(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    return db.query(Company).order_by(Company.id).all()


@router.get("/receipts", response_model=List[SubscriptionReceiptResponse])
def list_receipts(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    rows = ap.list_receipts(db)
    return [_receipt_row(r, db) for r in rows]


@router.post("/receipts/{receipt_id}/mark-paid", response_model=SubscriptionReceiptResponse)
def mark_paid(receipt_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    r = mark_receipt_paid(db, receipt_id)
    return _receipt_row(r, db)


@router.get("/admins", response_model=List[AdminUserDetail])
def list_admins(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    out = []
    for u in ap.list_tenant_admins(db):
        co = db.query(Company).filter(Company.id == u.company_id).first()
        receipts = (
            db.query(SubscriptionReceipt)
            .filter(SubscriptionReceipt.company_id == u.company_id)
            .order_by(SubscriptionReceipt.id.desc())
            .all()
        )
        out.append(AdminUserDetail(**ap.admin_out(db, u, co, receipts)))
    return out


@router.get("/admins/{user_id}", response_model=AdminUserDetail)
def get_admin(user_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    u, co, receipts = ap.get_admin_detail(db, user_id)
    return AdminUserDetail(**ap.admin_out(db, u, co, receipts))


@router.patch("/admins/{user_id}/sidebar", response_model=AdminUserDetail)
def patch_sidebar(
    user_id: int,
    body: AdminSidebarPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    u = ap.set_sidebar_modules(db, user_id, body.sidebar_modules)
    co = db.query(Company).filter(Company.id == u.company_id).first()
    receipts = (
        db.query(SubscriptionReceipt)
        .filter(SubscriptionReceipt.company_id == u.company_id)
        .order_by(SubscriptionReceipt.id.desc())
        .all()
    )
    return AdminUserDetail(**ap.admin_out(db, u, co, receipts))


@router.post("/admins/{user_id}/reset-password", response_model=AdminUserDetail)
def reset_password(
    user_id: int,
    body: AdminResetPassword,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    u = ap.reset_admin_password(db, user_id, body.new_password)
    co = db.query(Company).filter(Company.id == u.company_id).first()
    receipts = (
        db.query(SubscriptionReceipt)
        .filter(SubscriptionReceipt.company_id == u.company_id)
        .order_by(SubscriptionReceipt.id.desc())
        .all()
    )
    return AdminUserDetail(**ap.admin_out(db, u, co, receipts))
