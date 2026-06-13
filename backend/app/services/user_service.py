from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.models import User, Role
from app.schemas import CompanyUserCreate


def create_company_user(db: Session, company_id: int, data: CompanyUserCreate) -> User:
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
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
