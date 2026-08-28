import os

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Company
from app.schemas import (
    ForgotPasswordRequest,
    MessageResponse,
    ProfileUpdate,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SignupResponse,
    SubscriptionReceiptResponse,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserMeResponse,
    UserResponse,
    VerifyEmailRequest,
)
from app.auth import current_session_jti, get_current_user, SUPER_ADMIN_ROLE
from app.services import auth_service
from app.rbac import permissions_for_user_db, permission_bypass
from app.services.module_service import ensure_app_modules, module_access_for_role
from app.services.plan_enforcement import plan_summary
from app.services.receipt_service import parse_sidebar_modules
from app.services.module_service import parse_modules, path_allowed_by_modules
from app.storage_paths import resolve_storage_path
from app.services.image_avif_service import AVIF_EXT, AVIF_MIME

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


@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return auth_service.authenticate_user(
        db, credentials.email, credentials.password, ip_address=ip, user_agent=ua, remember_me=bool(credentials.remember_me)
    )


@router.post("/swagger-login", response_model=TokenResponse, include_in_schema=False)
def swagger_login(
    request: Request,
    credentials: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """OAuth2 form adapter used only by Swagger UI's Authorize dialog."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return auth_service.authenticate_user(
        db,
        credentials.username,
        credentials.password,
        ip_address=ip,
        user_agent=ua,
        remember_me=False,
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    jti: str | None = Depends(current_session_jti),
):
    """Revoke this session server-side.

    Clearing the token client-side left the session usable from any other tab or a
    copy of the token. Revoking the row means the next request on it fails, wherever it
    comes from.
    """
    auth_service.logout(db, jti)
    return {"message": "Signed out."}


@router.post("/logout-all", response_model=MessageResponse)
def logout_all(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Sign out of every device, for use after a suspected compromise."""
    count = auth_service.logout_everywhere(db, current_user.id)
    return {"message": f"Signed out of {count} session(s)."}


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    auth_service.request_password_reset(db, body.email)
    return {"message": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    auth_service.reset_password_with_token(db, body.token, body.new_password)
    return {"message": "Password updated. You can sign in now."}


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)):
    auth_service.verify_email_with_token(db, body.token)
    return {"message": "Email verified. You can sign in now."}


@router.post("/resend-verification", response_model=MessageResponse)
def resend_verification(body: ResendVerificationRequest, db: Session = Depends(get_db)):
    auth_service.resend_verification_email(db, body.email)
    return {"message": "If an account exists and needs verification, a new link has been sent."}


def _me_response(db: Session, current_user: User) -> UserMeResponse:
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
    ensure_app_modules(db)
    module_access = module_access_for_role(
        db,
        current_user.role_id,
        permission_bypass(db, current_user),
    )
    base = UserResponse.model_validate(current_user)
    return UserMeResponse(
        **base.model_dump(),
        permissions=perms,
        module_access=module_access,
        plan=plan,
        company_name=company_name,
        logo_url=logo_url,
        subscription_status=sub_status,
        subscription_end=sub_end,
        sidebar_modules=sidebar_modules,
        enabled_modules=enabled_modules,
    )


@router.get("/me", response_model=UserMeResponse)
def get_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _me_response(db, current_user)


@router.patch("/me/profile", response_model=UserMeResponse)
def patch_my_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename yourself.

    Deliberately ungated beyond being signed in: a display name is the caller's own,
    not a tenant record, so requiring roles.users_edit would leave every Staff and
    Client login unable to correct their own name. It writes nothing else — role,
    email and company are not settable here.
    """
    current_user.full_name = body.full_name
    db.commit()
    db.refresh(current_user)
    return _me_response(db, current_user)


@router.get("/company-logo")
def company_logo(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.company_id:
        raise HTTPException(status_code=404, detail="No company")
    co = db.query(Company).filter(Company.id == current_user.company_id).first()
    path = resolve_storage_path(co.logo_path) if co else None
    if not path:
        raise HTTPException(status_code=404, detail="Logo not found")
    ext = os.path.splitext(path)[1].lower()
    media_type = AVIF_MIME if ext == AVIF_EXT else None
    return FileResponse(path, media_type=media_type)
