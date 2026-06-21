from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
from app.models import User, Company
from app.schemas import UserCreate
from app.auth import get_password_hash, create_access_token, SUPER_ADMIN_ROLE, create_password_reset_token, verify_password_reset_token
from datetime import timedelta
from app.config import settings
from app.services.role_service import ensure_roles_for_company, get_role_by_slug
from app.services.receipt_service import company_subscription_blocked, create_receipt_for_signup
from app.plan_config import normalize_tier
from app.services import email_service
from app.services.module_service import modules_from_plan, dump_modules

def create_user_and_company(db: Session, user_data: UserCreate) -> User:
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    is_super = bool(getattr(settings, "super_admin_email", "")) and user_data.email.lower() == getattr(settings, "super_admin_email", "").lower()
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        password_hash=hashed_password,
        full_name=user_data.full_name,
        role=SUPER_ADMIN_ROLE if is_super else "admin",
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
    return user, r

def authenticate_user(db: Session, email: str, password: str, ip_address: str | None = None, user_agent: str | None = None, remember_me: bool = False) -> dict:
    from app.auth import verify_password
    from app.services import login_log_service

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        login_log_service.log_login(db, email=email, status="failed", ip_address=ip_address, user_agent=user_agent)
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        login_log_service.log_login(db, email=email, status="failed", user=user, ip_address=ip_address, user_agent=user_agent)
        raise HTTPException(status_code=403, detail="Account is deactivated")
    block = company_subscription_blocked(db, user)
    if block:
        login_log_service.log_login(db, email=email, status="failed", user=user, ip_address=ip_address, user_agent=user_agent)
        raise HTTPException(status_code=402, detail=block)

    login_log_service.log_login(db, email=email, status="success", user=user, ip_address=ip_address, user_agent=user_agent)
    if remember_me:
        access_token_expires = timedelta(days=settings.remember_me_expire_days)
    else:
        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.id}, expires_delta=access_token_expires
    )
    return {"access_token": str(access_token), "token_type": "bearer"}


def request_password_reset(db: Session, email: str) -> None:
    user = db.query(User).filter(func.lower(User.email) == email.lower().strip()).first()
    if not user or not user.is_active:
        return
    token = create_password_reset_token(user.id)
    link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
    body = (
        f"<p>Hi {user.full_name},</p>"
        f"<p>Click the link below to reset your password. This link expires in 1 hour.</p>"
        f'<p><a href="{link}">Reset password</a></p>'
        f"<p>If you did not request this, you can ignore this email.</p>"
    )
    if email_service.is_configured():
        email_service.send_email(user.email, "Reset your password", body)


def reset_password_with_token(db: Session, token: str, new_password: str) -> None:
    user_id = verify_password_reset_token(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    user.password_hash = get_password_hash(new_password)
    db.commit()
