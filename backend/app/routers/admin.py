from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, SubscriptionReceipt, Company
from app.schemas import (
    CompanyAdminResponse,
    SubscriptionReceiptResponse,
    AdminResetPassword,
    AdminSidebarPatch,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserActivePatch,
    AdminCompanyUpdate,
    AdminModulesPatch,
    AdminPaymentResponse,
    PlanTierOut,
    PlanTierUpdate,
    SubscriptionInvoiceResponse,
    SubscriptionInvoiceStatusPatch,
    SubscriptionInvoicePaymentPatch,
    LoginLogResponse,
    AdminDashboardResponse,
    SmtpConfigResponse,
    SmtpConfigUpdate,
    BillingSettingsResponse,
    BillingSettingsPatch,
    AdminCouponCreate,
)
from app.auth import get_current_super_admin
from app.services import admin_platform_service as ap
from app.services import platform_plans_service
from app.services import subscription_invoice_service as sub_inv
from app.services import login_log_service
from app.services import tenant_usage_service
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


@router.get("/dashboard", response_model=AdminDashboardResponse)
def admin_dashboard(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    sub_inv.ensure_renewal_invoices(db)
    stats = sub_inv.dashboard_stats(db)
    stats["platform_usage"] = tenant_usage_service.platform_usage_summary(db)
    return AdminDashboardResponse(**stats)


@router.get("/companies", response_model=List[CompanyAdminResponse])
def list_all_companies(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    return [CompanyAdminResponse(**ap.company_admin_out(db, c)) for c in db.query(Company).order_by(Company.id).all()]


@router.get("/companies/{company_id}", response_model=CompanyAdminResponse)
def get_company(company_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Company not found")
    return CompanyAdminResponse(**ap.company_admin_out(db, co))


@router.patch("/companies/{company_id}", response_model=CompanyAdminResponse)
def patch_company(
    company_id: int,
    body: AdminCompanyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    payload = body.model_dump(exclude_unset=True)
    co = ap.update_company(db, company_id, payload)
    return CompanyAdminResponse(**ap.company_admin_out(db, co))


@router.patch("/companies/{company_id}/modules", response_model=CompanyAdminResponse)
def patch_company_modules(
    company_id: int,
    body: AdminModulesPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    co = ap.update_company(db, company_id, {"enabled_modules": body.enabled_modules})
    return CompanyAdminResponse(**ap.company_admin_out(db, co))


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


@router.get("/invoices", response_model=List[SubscriptionInvoiceResponse])
def list_invoices(
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    return [SubscriptionInvoiceResponse(**row) for row in sub_inv.list_invoices(db, company_id, status)]


@router.get("/invoices/{invoice_id}", response_model=SubscriptionInvoiceResponse)
def get_invoice(invoice_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    return SubscriptionInvoiceResponse(**sub_inv.get_invoice(db, invoice_id))


@router.patch("/invoices/{invoice_id}/status", response_model=SubscriptionInvoiceResponse)
def patch_invoice_status(
    invoice_id: int,
    body: SubscriptionInvoiceStatusPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    return SubscriptionInvoiceResponse(**sub_inv.set_invoice_status(db, invoice_id, body.status))


@router.post("/invoices/{invoice_id}/payment", response_model=SubscriptionInvoiceResponse)
def record_invoice_payment(
    invoice_id: int,
    body: SubscriptionInvoicePaymentPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    return SubscriptionInvoiceResponse(**sub_inv.record_payment(db, invoice_id, body.amount))


@router.post("/invoices/{invoice_id}/send-email", response_model=SubscriptionInvoiceResponse)
def send_invoice_email(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    from app.models import SubscriptionInvoice
    inv = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.id == invoice_id).first()
    if not inv:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Invoice not found")
    sub_inv.send_invoice_email(db, inv)
    return SubscriptionInvoiceResponse(**sub_inv.get_invoice(db, invoice_id))


@router.post("/invoices/generate")
def generate_invoices(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    created = sub_inv.ensure_renewal_invoices(db)
    return {"created": created}


@router.get("/payments", response_model=List[AdminPaymentResponse])
def list_payments(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    from app.models import SubscriptionInvoice
    q = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.amount_paid > 0).order_by(SubscriptionInvoice.paid_at.desc())
    if company_id:
        q = q.filter(SubscriptionInvoice.company_id == company_id)
    rows = q.all()
    out = []
    for inv in rows:
        co = db.query(Company).filter(Company.id == inv.company_id).first()
        out.append(
            AdminPaymentResponse(
                id=inv.id,
                company_id=inv.company_id,
                invoice_id=inv.id,
                amount=inv.amount_paid or 0,
                method="subscription",
                paid_at=inv.paid_at or inv.created_at,
                created_at=inv.created_at,
                company_name=co.name if co else None,
                invoice_total=inv.total_amount,
            )
        )
    return out


@router.get("/packages", response_model=List[PlanTierOut])
def list_packages(_: User = Depends(get_current_super_admin)):
    return [PlanTierOut(**row) for row in platform_plans_service.list_tiers()]


@router.patch("/packages/{tier}", response_model=PlanTierOut)
def patch_package(tier: str, body: PlanTierUpdate, _: User = Depends(get_current_super_admin)):
    payload = body.model_dump(exclude_unset=True)
    return PlanTierOut(**platform_plans_service.update_tier(tier, payload))


@router.get("/smtp", response_model=SmtpConfigResponse)
def get_smtp(_: User = Depends(get_current_super_admin)):
    from app.services.platform_smtp_service import smtp_status
    return SmtpConfigResponse(**smtp_status())


@router.patch("/smtp", response_model=SmtpConfigResponse)
def patch_smtp(body: SmtpConfigUpdate, _: User = Depends(get_current_super_admin)):
    from app.services.platform_smtp_service import update_smtp_config
    return SmtpConfigResponse(**update_smtp_config(body.model_dump(exclude_unset=True)))


@router.get("/settings/billing", response_model=BillingSettingsResponse)
def get_billing_settings(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    from app.services import platform_settings_service
    return BillingSettingsResponse(**platform_settings_service.get_billing_settings(db))


@router.patch("/settings/billing", response_model=BillingSettingsResponse)
def patch_billing_settings(
    body: BillingSettingsPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    from app.services import platform_settings_service, stripe_plan_service
    data = body.model_dump(exclude_unset=True)
    out = platform_settings_service.update_billing_settings(db, data)
    if "yearly_discount_percent" in data:
        stripe_plan_service.ensure_yearly_coupon(db)
        stripe_plan_service.sync_all_plans(db)
    return BillingSettingsResponse(**out)


@router.post("/stripe/sync-plans")
def sync_stripe_plans(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    from app.services import stripe_plan_service
    return stripe_plan_service.sync_all_plans(db)


@router.post("/coupons")
def create_coupon(body: AdminCouponCreate, db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    from app.services import stripe_plan_service
    return stripe_plan_service.create_admin_coupon(
        db,
        percent_off=body.percent_off,
        amount_off=body.amount_off,
        duration=body.duration,
        max_redemptions=body.max_redemptions,
    )


@router.get("/receipts", response_model=List[SubscriptionReceiptResponse])
def list_receipts(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    rows = ap.list_receipts(db)
    return [_receipt_row(r, db) for r in rows]


@router.post("/receipts/{receipt_id}/mark-paid", response_model=SubscriptionReceiptResponse)
def mark_paid(receipt_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    r = mark_receipt_paid(db, receipt_id)
    return _receipt_row(r, db)


@router.get("/login-logs", response_model=List[LoginLogResponse])
def login_logs(
    company_id: Optional[int] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    return [LoginLogResponse.model_validate(r) for r in login_log_service.list_login_logs(db, limit, company_id)]


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
