from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Invoice, SubscriptionReceipt, Company
from app.schemas import (
    CompanyResponse,
    SubscriptionReceiptResponse,
    AdminResetPassword,
    AdminSidebarPatch,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserActivePatch,
    AdminCompanyUpdate,
    InvoiceResponse,
    InvoiceUpdate,
    AdminPaymentResponse,
    PlanTierOut,
    PlanTierUpdate,
)
from app.auth import get_current_super_admin
from app.services import admin_platform_service as ap
from app.services import platform_plans_service
from app.services.receipt_service import mark_receipt_paid
from app.routers.invoices import _serialize_invoice
from app.services.invoice_pdf import render_invoice_pdf

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


@router.patch("/companies/{company_id}", response_model=CompanyResponse)
def patch_company(
    company_id: int,
    body: AdminCompanyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    payload = body.model_dump(exclude_unset=True)
    return ap.update_company(db, company_id, payload)


@router.get("/users", response_model=List[AdminUserListItem])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    return [AdminUserListItem(**row) for row in ap.list_all_users(db)]


@router.patch("/users/{user_id}/active", response_model=AdminUserListItem)
def patch_user_active(
    user_id: int,
    body: AdminUserActivePatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    u = ap.set_user_active(db, user_id, body.is_active)
    co = db.query(Company).filter(Company.id == u.company_id).first() if u.company_id else None
    return AdminUserListItem(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
        is_active=u.is_active,
        created_at=u.created_at,
        company_id=u.company_id,
        company_name=co.name if co else None,
        subscription_tier=co.subscription_tier if co else None,
        subscription_status=co.subscription_status if co else None,
    )


@router.get("/invoices", response_model=List[InvoiceResponse])
def list_invoices(
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    rows = ap.list_all_invoices(db, company_id, status)
    return [_serialize_invoice(inv, False, db) for inv in rows]


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    inv = ap.get_invoice_admin(db, invoice_id)
    return _serialize_invoice(inv, True, db)


@router.patch("/invoices/{invoice_id}", response_model=InvoiceResponse)
def patch_invoice(
    invoice_id: int,
    body: InvoiceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    inv = ap.update_invoice_admin(db, invoice_id, body)
    inv = ap.get_invoice_admin(db, inv.id)
    return _serialize_invoice(inv, True, db)


@router.patch("/invoices/{invoice_id}/status", response_model=InvoiceResponse)
def patch_invoice_status(
    invoice_id: int,
    status: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    inv = ap.set_invoice_status_admin(db, invoice_id, status)
    inv = ap.get_invoice_admin(db, inv.id)
    return _serialize_invoice(inv, True, db)


@router.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    inv = ap.get_invoice_admin(db, invoice_id)
    lines = sorted(inv.lines, key=lambda x: x.id)
    admin = db.query(User).filter(User.id == inv.company.admin_id).first() if inv.company else None
    body = render_invoice_pdf(db, inv, inv.company, inv.client, list(lines), admin)
    return Response(
        content=body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{invoice_id}.pdf"'},
    )


@router.get("/payments", response_model=List[AdminPaymentResponse])
def list_payments(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    return [AdminPaymentResponse(**row) for row in ap.list_all_payments(db, company_id)]


@router.get("/packages", response_model=List[PlanTierOut])
def list_packages(_: User = Depends(get_current_super_admin)):
    return [PlanTierOut(**row) for row in platform_plans_service.list_tiers()]


@router.patch("/packages/{tier}", response_model=PlanTierOut)
def patch_package(tier: str, body: PlanTierUpdate, _: User = Depends(get_current_super_admin)):
    payload = body.model_dump(exclude_unset=True)
    return PlanTierOut(**platform_plans_service.update_tier(tier, payload))


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
