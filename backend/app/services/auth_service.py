from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
from app.html_safe import esc
from app.models import User, Company
from app.schemas import UserCreate
from app.auth import (
    get_password_hash,
    create_access_token,
    SUPER_ADMIN_ROLE,
    create_password_reset_token,
    verify_password_reset_token,
    create_email_verification_token,
    verify_email_verification_token,
    requires_email_verification,
    AUTH_PROVIDER_LOCAL,
    OAUTH_AUTH_PROVIDERS,
)
from datetime import datetime, timedelta, timezone
from app.config import settings
from app.services.role_service import ensure_roles_for_company, get_role_by_slug
from app.services.receipt_service import company_subscription_blocked, create_receipt_for_signup, latest_pending_receipt
from app.plan_config import normalize_tier
from app.services import email_service
from app.services.module_service import modules_from_plan, dump_modules

def send_verification_email(user: User) -> None:
    if not requires_email_verification(user):
        return
    token = create_email_verification_token(user.id)
    link = f"{settings.frontend_url.rstrip('/')}/verify-email?token={token}"
    body = (
        f"<p>Hi {esc(user.full_name)},</p>"
        f"<p>Please verify your email address to activate your ControlOps account.</p>"
        f'<p><a href="{link}">Verify email</a></p>'
        f"<p>This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>"
    )
    if email_service.is_configured():
        email_service.send_email_async(user.email, "Verify your email", body)


def verify_email_with_token(db: Session, token: str) -> None:
    user_id = verify_email_verification_token(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    if (getattr(user, "auth_provider", None) or AUTH_PROVIDER_LOCAL) in OAUTH_AUTH_PROVIDERS:
        return
    user.email_verified = True
    db.commit()


def resend_verification_email(db: Session, email: str) -> None:
    user = db.query(User).filter(func.lower(User.email) == email.lower().strip()).first()
    if not user or not user.is_active or not requires_email_verification(user):
        return
    send_verification_email(user)

def create_user_and_company(db: Session, user_data: UserCreate) -> User:
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        if requires_email_verification(existing):
            send_verification_email(existing)
            receipt_ref = None
            if existing.company_id:
                pending = latest_pending_receipt(db, existing.company_id)
                receipt_ref = pending.ref_id if pending else None
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "email_verification_required",
                    "message": "Account exists but email is not verified. A new verification link has been sent.",
                    "email": existing.email,
                    "receipt_ref": receipt_ref,
                },
            )
        raise HTTPException(status_code=400, detail="Email already registered")
    is_super = bool(getattr(settings, "super_admin_email", "")) and user_data.email.lower() == getattr(settings, "super_admin_email", "").lower()
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        password_hash=hashed_password,
        full_name=user_data.full_name,
        role=SUPER_ADMIN_ROLE if is_super else "admin",
        auth_provider=AUTH_PROVIDER_LOCAL,
        email_verified=is_super,
    )
    db.add(user)
    db.flush()
    if not is_super:
        # tier = user_data.subscription_tier if user_data.subscription_tier and user_data.subscription_tier in TIERS else "basic"
        tier = normalize_tier(user_data.subscription_tier)
        company = Company(
            name=user_data.company_name,
            admin_id=user.id,
            subscription_tier=tier,
            subscription_status="pending",
            enabled_modules_json=dump_modules(modules_from_plan(tier)),
        )
        db.add(company)
        db.flush()
        user.company_id = company.id
        ensure_roles_for_company(db, company.id)
        db.flush()
        ar = get_role_by_slug(db, company.id, "admin")
        if ar:
            user.role_id = ar.id
        user.role = "admin"
        create_receipt_for_signup(db, company, user, tier)
    db.commit()
    db.refresh(user)
    if requires_email_verification(user):
        if email_service.is_configured():
            try:
                send_verification_email(user)
            except Exception:
                pass
        else:
            user.email_verified = True
            db.commit()
            db.refresh(user)
    return user


def signup_with_receipt(db: Session, user_data: UserCreate):
    from app.models import SubscriptionReceipt
    user = create_user_and_company(db, user_data)
    if not user.company_id:
        raise HTTPException(status_code=400, detail="Company signup required")
    r = (
        db.query(SubscriptionReceipt)
        .filter(SubscriptionReceipt.user_id == user.id)
        .order_by(SubscriptionReceipt.id.desc())
        .first()
    )
    if not r:
        raise HTTPException(status_code=500, detail="Receipt not created")
    return user, r, requires_email_verification(user)

def authenticate_user(db: Session, email: str, password: str, ip_address: str | None = None, user_agent: str | None = None, remember_me: bool = False) -> dict:
    from app.auth import verify_password
    from app.services import login_guard_service, login_log_service, session_service

    # Before the password is verified, so a locked-out caller never reaches bcrypt.
    login_guard_service.assert_login_allowed(db, email, ip_address)

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        login_log_service.log_login(db, email=email, status="failed", ip_address=ip_address, user_agent=user_agent)
        raise HTTPException(status_code=401, detail="The email or password is incorrect.")
    if not user.is_active:
        login_log_service.log_login(db, email=email, status="failed", user=user, ip_address=ip_address, user_agent=user_agent)
        raise HTTPException(status_code=403, detail="Account is deactivated")
    if requires_email_verification(user):
        login_log_service.log_login(db, email=email, status="failed", user=user, ip_address=ip_address, user_agent=user_agent)
        receipt_ref = None
        if user.company_id:
            pending = latest_pending_receipt(db, user.company_id)
            receipt_ref = pending.ref_id if pending else None
        raise HTTPException(
            status_code=403,
            detail={
                "code": "email_verification_required",
                "message": "Email not verified. Check your inbox for the verification link.",
                "email": user.email,
                "receipt_ref": receipt_ref,
            },
        )
    block = company_subscription_blocked(db, user)
    if block:
        login_log_service.log_login(db, email=email, status="failed", user=user, ip_address=ip_address, user_agent=user_agent)
        raise HTTPException(status_code=402, detail=block)

    login_log_service.log_login(db, email=email, status="success", user=user, ip_address=ip_address, user_agent=user_agent)
    if remember_me:
        access_token_expires = timedelta(days=settings.remember_me_expire_days)
    else:
        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)

    jti = session_service.new_jti()
    session_service.create_session(
        db,
        user.id,
        jti,
        expires_at=datetime.now(timezone.utc) + access_token_expires,
        remember_me=remember_me,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    access_token = create_access_token(
        data={"sub": user.id, "jti": jti}, expires_delta=access_token_expires
    )
    return {"access_token": str(access_token), "token_type": "bearer"}


def logout(db: Session, jti: str | None) -> None:
    """Revoke the presented session. Idempotent, so a double logout is not an error."""
    from app.services import session_service

    if jti:
        session_service.revoke(db, jti)


def logout_everywhere(db: Session, user_id: int) -> int:
    from app.services import session_service

    return session_service.revoke_all_for_user(db, user_id)


def request_password_reset(db: Session, email: str) -> None:
    user = db.query(User).filter(func.lower(User.email) == email.lower().strip()).first()
    if not user or not user.is_active:
        return
    token = create_password_reset_token(user.id)
    link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
    body = (
        f"<p>Hi {esc(user.full_name)},</p>"
        f"<p>Click the link below to reset your password. This link expires in 1 hour.</p>"
        f'<p><a href="{link}">Reset password</a></p>'
        f"<p>If you did not request this, you can ignore this email.</p>"
    )
    if email_service.is_configured():
        email_service.send_email_async(user.email, "Reset your password", body)


def reset_password_with_token(db: Session, token: str, new_password: str) -> None:
    from app.services import session_service

    user_id = verify_password_reset_token(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    user.password_hash = get_password_hash(new_password)
    db.commit()
    # Whoever prompted the reset may be holding a live token. Changing the password has
    # to end every existing session, or a compromised one survives the recovery.
    session_service.revoke_all_for_user(db, user.id)
