from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import User, Company
from app.schemas import UserCreate
from app.auth import get_password_hash, create_access_token, SUPER_ADMIN_ROLE
from datetime import timedelta
from app.config import settings
from app.services.role_service import ensure_roles_for_company, get_role_by_slug

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
        tier = user_data.subscription_tier or "basic"
        company = Company(name=user_data.company_name, admin_id=user.id, subscription_tier=tier)
        db.add(company)
        db.flush()
        user.company_id = company.id
        ensure_roles_for_company(db, company.id)
        db.flush()
        ar = get_role_by_slug(db, company.id, "admin")
        if ar:
            user.role_id = ar.id
        user.role = "admin"
    db.commit()
    db.refresh(user)
    return user

def authenticate_user(db: Session, email: str, password: str) -> dict:
    from app.auth import verify_password
    
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.id}, expires_delta=access_token_expires
    )
    return {"access_token": str(access_token), "token_type": "bearer"}
