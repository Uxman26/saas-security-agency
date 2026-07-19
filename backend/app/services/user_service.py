from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.models import User, Role, Company
from app.schemas import CompanyUserCreate, CompanyUserUpdate
from app.services.plan_enforcement import enforce_user_quota


def _get_user(db: Session, company_id: int, user_id: int) -> User:
    u = db.query(User).filter(User.id == user_id, User.company_id == company_id).first()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return u


def create_company_user(db: Session, company_id: int, data: CompanyUserCreate) -> User:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    enforce_user_quota(db, company)
    email = data.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    role = db.query(Role).filter(Role.id == data.role_id, Role.company_id == company_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if role.slug == "super_admin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    user = User(
        email=email,
        password_hash=get_password_hash(data.password),
        full_name=data.full_name.strip(),
        role=role.slug,
        role_id=role.id,
        company_id=company_id,
        client_id=data.client_id,
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_company_user(db: Session, company_id: int, user_id: int, data: CompanyUserUpdate) -> User:
    user = _get_user(db, company_id, user_id)
    if data.email is not None:
        email = data.email.lower().strip()
        clash = db.query(User).filter(func.lower(User.email) == email, User.id != user_id).first()
        if clash:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        user.email = email
    if data.full_name is not None:
        user.full_name = data.full_name.strip()
    if data.password:
        user.password_hash = get_password_hash(data.password)
    if data.role_id is not None:
        if user.role_row and user.role_row.slug == "admin" and data.role_id != user.role_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin role cannot be changed",
            )
        role = db.query(Role).filter(Role.id == data.role_id, Role.company_id == company_id).first()
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        user.role_id = role.id
        user.role = role.slug
    db.commit()
    db.refresh(user)
    return user


def reset_company_user_password(db: Session, company_id: int, user_id: int, new_password: str) -> User:
    user = _get_user(db, company_id, user_id)
    user.password_hash = get_password_hash(new_password)
    db.commit()
    db.refresh(user)
    return user


def delete_company_user(db: Session, company_id: int, user_id: int, actor_id: int) -> None:
    if user_id == actor_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    user = _get_user(db, company_id, user_id)
    if company.admin_id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the company owner account")
    db.delete(user)
    db.commit()
