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
from app.services.receipt_service import company_login_blocked, create_receipt_for_signup, latest_pending_receipt
from app.plan_config import normalize_tier
from app.services import email_service
from app.services.module_service import modules_from_plan, dump_modules

def send_verification_email(user: User) -> None:
    if not requires_email_verification(user):
        return
    token = create_email_verification_token(user.id)
    link = f"{settings.frontend_url.rstrip('/')}/verify-email?token={token}"
    from app.database import SessionLocal
    from app.services.platform_mail_service import send_template_email

    db = SessionLocal()
    try:
        sent = send_template_email(
            db,
            key="account_verification",
            to_email=user.email,
            variables={
                "full_name": user.full_name or user.email,
                "email": user.email,
                "verify_url": link,
                "company_name": "",
            },
            company_id=user.company_id,
            user_id=user.id,
            fallback_subject="Verify your email",
            fallback_body=f"Hi {user.full_name},\n\nVerify your email: {link}",
        )
        if not sent and email_service.is_configured():
            body = (
                f"<p>Hi {esc(user.full_name)},</p>"
                f"<p>Please verify your email address to activate your ControlOps account.</p>"
                f'<p><a href="{link}">Verify email</a></p>'
                f"<p>This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>"
            )
            email_service.send_email_async(user.email, "Verify your email", body)
    finally:
        db.close()


def send_welcome_email(user: User, company_name: str = "") -> None:
    from app.database import SessionLocal
    from app.services.platform_mail_service import send_template_email

    login_url = f"{settings.frontend_url.rstrip('/')}/login"
    db = SessionLocal()
    try:
        send_template_email(
            db,
            key="welcome_onboarding",
            to_email=user.email,
            variables={
                "full_name": user.full_name or user.email,
                "email": user.email,
                "company_name": company_name or "",
                "login_url": login_url,
            },
            company_id=user.company_id,
            user_id=user.id,
        )
    finally:
        db.close()


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
    from app.services.email_uniqueness import DUPLICATE_EMAIL_MESSAGE, find_user_by_email, normalize_email

    email = normalize_email(user_data.email)
    existing = find_user_by_email(db, email)
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
        raise HTTPException(status_code=400, detail=DUPLICATE_EMAIL_MESSAGE)
    is_super = bool(getattr(settings, "super_admin_email", "")) and email == getattr(settings, "super_admin_email", "").lower()
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=email,
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
            try:
                send_welcome_email(user, user_data.company_name or "")
            except Exception:
                pass
    else:
        try:
            send_welcome_email(user, user_data.company_name if hasattr(user_data, "company_name") else "")
        except Exception:
            pass
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

    login_guard_service.assert_login_allowed(db, email, ip_address)

    user = db.query(User).filter(func.lower(User.email) == email.lower().strip()).first()
    if not user or not verify_password(password, user.password_hash):
        login_log_service.log_login(db, email=email, status="failed", ip_address=ip_address, user_agent=user_agent, user=user)
        if user and (getattr(user, "auth_provider", None) or AUTH_PROVIDER_LOCAL) in OAUTH_AUTH_PROVIDERS:
            raise HTTPException(
                status_code=401,
                detail="This account uses social sign-in. Please continue with Google, Microsoft, or Apple.",
            )
        try:
            from app.services.admin_platform_ext_service import record_security_event
            record_security_event(
                db,
                event_type="login.failed",
                message=f"Failed login for {email}",
                severity="warning",
                company_id=user.company_id if user else None,
                user_id=user.id if user else None,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        except Exception:
            pass
        if user:
            login_guard_service.record_failed_password_attempt(db, user)
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
    block = company_login_blocked(db, user)
    if block:
        login_log_service.log_login(db, email=email, status="failed", user=user, ip_address=ip_address, user_agent=user_agent)
        raise HTTPException(status_code=402, detail=block)

    login_guard_service.clear_login_failures(user)
    db.commit()

    if getattr(user, "role", None) == SUPER_ADMIN_ROLE and getattr(user, "mfa_enabled", False):
        from app.services import mfa_service
        return {
            "access_token": None,
            "token_type": "bearer",
            "mfa_required": True,
            "mfa_token": mfa_service.create_mfa_challenge_token(user.id, remember_me=remember_me),
        }

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
    return {"access_token": str(access_token), "token_type": "bearer", "mfa_required": False, "mfa_token": None}


def complete_mfa_login(
    db: Session,
    mfa_token: str,
    code: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict:
    from app.services import mfa_service, login_log_service, session_service

    user_id, remember_me = mfa_service.verify_mfa_challenge_token(mfa_token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid MFA challenge")
    if not mfa_service.validate_mfa_code(user, code):
        login_log_service.log_login(db, email=user.email, status="failed", user=user, ip_address=ip_address, user_agent=user_agent)
        raise HTTPException(status_code=401, detail="Invalid authenticator code")
    db.commit()
    login_log_service.log_login(db, email=user.email, status="success", user=user, ip_address=ip_address, user_agent=user_agent)
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
    return {"access_token": str(access_token), "token_type": "bearer", "mfa_required": False, "mfa_token": None}


def logout(db: Session, jti: str | None) -> None:
    """Revoke the presented session. Idempotent, so a double logout is not an error."""
    from app.services import session_service

    if jti:
        session_service.revoke(db, jti)


def logout_everywhere(db: Session, user_id: int) -> int:
    from app.services import session_service

    return session_service.revoke_all_for_user(db, user_id)


def request_password_reset(db: Session, email: str, *, requested_by_user_id: int | None = None, ip_address: str | None = None) -> None:
    import secrets
    from app.models import PasswordResetRequest
    from app.services.platform_mail_service import send_template_email

    user = db.query(User).filter(func.lower(User.email) == email.lower().strip()).first()
    if not user or not user.is_active:
        return
    jti = secrets.token_urlsafe(24)
    token = create_password_reset_token(user.id, jti)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.query(PasswordResetRequest).filter(
        PasswordResetRequest.user_id == user.id,
        PasswordResetRequest.status == "sent",
        PasswordResetRequest.used_at.is_(None),
    ).update({"status": "superseded"}, synchronize_session=False)
    db.add(
        PasswordResetRequest(
            user_id=user.id,
            requested_by_user_id=requested_by_user_id,
            channel="email",
            status="sent",
            token_jti=jti,
            ip_address=ip_address,
            expires_at=expires_at,
        )
    )
    db.commit()
    link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
    send_template_email(
        db,
        key="password_reset",
        to_email=user.email,
        variables={
            "full_name": user.full_name or user.email,
            "email": user.email,
            "reset_url": link,
            "company_name": "",
        },
        company_id=user.company_id,
        user_id=user.id,
        sent_by_user_id=requested_by_user_id,
        fallback_subject="Reset your password",
        fallback_body=f"Hi {user.full_name},\n\nReset your password: {link}",
    )


def reset_password_with_token(db: Session, token: str, new_password: str) -> None:
    from app.models import PasswordResetRequest
    from app.services import session_service, login_guard_service

    user_id, jti = verify_password_reset_token(token)
    row = (
        db.query(PasswordResetRequest)
        .filter(PasswordResetRequest.token_jti == jti, PasswordResetRequest.user_id == user_id)
        .first()
    )
    if not row or row.status in ("used", "superseded") or row.used_at is not None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    if row.expires_at:
        exp = row.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    user.password_hash = get_password_hash(new_password)
    login_guard_service.clear_lockout_state(user)
    row.status = "used"
    row.used_at = datetime.now(timezone.utc)
    db.commit()
    session_service.revoke_all_for_user(db, user.id)
