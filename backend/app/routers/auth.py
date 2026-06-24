import os
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Company
from app.schemas import UserCreate, UserResponse, UserLogin, UserMeResponse, SignupResponse, SubscriptionReceiptResponse, ForgotPasswordRequest, ResetPasswordRequest, VerifyEmailRequest, ResendVerificationRequest
from app.auth import get_current_user, SUPER_ADMIN_ROLE
from app.services import auth_service
from app.rbac import permissions_for_user_db
from app.services.plan_enforcement import plan_summary
from app.services.receipt_service import parse_sidebar_modules
from app.services.module_service import parse_modules, path_allowed_by_modules
from app.storage_paths import resolve_storage_path

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    user, receipt, needs_verify = auth_service.signup_with_receipt(db, user_data)
    co = db.query(Company).filter(Company.id == user.company_id).first()
    return SignupResponse(
        user=UserResponse.model_validate(user),
        receipt=SubscriptionReceiptResponse(
            id=receipt.id,
            ref_id=receipt.ref_id,
            company_id=receipt.company_id,
            company_name=co.name if co else None,
            user_email=user.email,
            subscription_tier=receipt.subscription_tier,
            amount=receipt.amount,
            period_days=receipt.period_days,
            status=receipt.status,
            period_start=receipt.period_start,
            period_end=receipt.period_end,
            paid_at=receipt.paid_at,
            created_at=receipt.created_at,
        ),
        email_verification_required=needs_verify,
    )


@router.post("/login")
def login(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return auth_service.authenticate_user(
        db, credentials.email, credentials.password, ip_address=ip, user_agent=ua, remember_me=bool(credentials.remember_me)
    )


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    auth_service.request_password_reset(db, body.email)
    return {"message": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    auth_service.reset_password_with_token(db, body.token, body.new_password)
    return {"message": "Password updated. You can sign in now."}


@router.post("/verify-email")
def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)):
    auth_service.verify_email_with_token(db, body.token)
    return {"message": "Email verified. You can sign in now."}


@router.post("/resend-verification")
def resend_verification(body: ResendVerificationRequest, db: Session = Depends(get_db)):
    auth_service.resend_verification_email(db, body.email)
    return {"message": "If an account exists and needs verification, a new link has been sent."}


@router.get("/me", response_model=UserMeResponse)
def get_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    perms = permissions_for_user_db(db, current_user)
    plan = None
    company_name = None
    logo_url = None
    co = None
    if current_user.company_id:
        co = db.query(Company).filter(Company.id == current_user.company_id).first()
        if co:
            plan = plan_summary(db, co)
            company_name = co.name
            if resolve_storage_path(co.logo_path):
                logo_url = "/auth/company-logo"
    sub_status = None
    sub_end = None
    sidebar_modules = None
    enabled_modules = None
    if current_user.company_id and co:
        sub_status = co.subscription_status
        sub_end = co.subscription_end
        enabled_modules = parse_modules(co.enabled_modules_json)
    if getattr(current_user, "role", None) != SUPER_ADMIN_ROLE:
        sidebar_modules = parse_sidebar_modules(current_user.sidebar_modules_json)
        if sidebar_modules and co:
            sidebar_modules = [p for p in sidebar_modules if path_allowed_by_modules(co, p)]
    base = UserResponse.model_validate(current_user)
    return UserMeResponse(
        **base.model_dump(),
        permissions=perms,
        plan=plan,
        company_name=company_name,
        logo_url=logo_url,
        subscription_status=sub_status,
        subscription_end=sub_end,
        sidebar_modules=sidebar_modules,
        enabled_modules=enabled_modules,
    )


@router.get("/company-logo")
def company_logo(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.company_id:
        raise HTTPException(status_code=404, detail="No company")
    co = db.query(Company).filter(Company.id == current_user.company_id).first()
    path = resolve_storage_path(co.logo_path) if co else None
    if not path:
        raise HTTPException(status_code=404, detail="Logo not found")
    return FileResponse(path)
