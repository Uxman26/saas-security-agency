from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Role
from app.rbac import require_perm, PERM_ROLES_READ, PERM_ROLES_WRITE, PERM_ROLES_DELETE
from app.schemas import CompanyUserOut, UserRolePatch, CompanyUserCreate, CompanyUserUpdate, CompanyUserResetPassword
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


def _require_company(user: User) -> int:
    if not user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return user.company_id


def _out(u: User) -> CompanyUserOut:
    rr = u.role_row
    return CompanyUserOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role_id=u.role_id,
        role_slug=rr.slug if rr else None,
        role_name=rr.name if rr else None,
    )


@router.get("", response_model=list[CompanyUserOut])
def list_company_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_READ)),
):
    cid = _require_company(current_user)
    rows = db.query(User).filter(User.company_id == cid).order_by(User.email).all()
    return [_out(u) for u in rows]


@router.get("/{user_id}", response_model=CompanyUserOut)
def get_company_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_READ)),
):
    cid = _require_company(current_user)
    return _out(user_service._get_user(db, cid, user_id))


@router.post("", response_model=CompanyUserOut, status_code=status.HTTP_201_CREATED)
def create_company_user(
    body: CompanyUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_WRITE)),
):
    cid = _require_company(current_user)
    u = user_service.create_company_user(db, cid, body)
    return _out(u)


@router.put("/{user_id}", response_model=CompanyUserOut)
def update_company_user(
    user_id: int,
    body: CompanyUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_WRITE)),
):
    cid = _require_company(current_user)
    u = user_service.update_company_user(db, cid, user_id, body)
    return _out(u)


@router.post("/{user_id}/reset-password", response_model=CompanyUserOut)
def reset_company_user_password(
    user_id: int,
    body: CompanyUserResetPassword,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_WRITE)),
):
    cid = _require_company(current_user)
    u = user_service.reset_company_user_password(db, cid, user_id, body.new_password)
    return _out(u)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_DELETE)),
):
    cid = _require_company(current_user)
    user_service.delete_company_user(db, cid, user_id, current_user.id)


@router.patch("/{user_id}/role", response_model=CompanyUserOut)
def patch_user_role(
    user_id: int,
    body: UserRolePatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_WRITE)),
):
    cid = _require_company(current_user)
    tu = db.query(User).filter(User.id == user_id, User.company_id == cid).first()
    if not tu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if tu.role_row and tu.role_row.slug == "admin" and body.role_id != tu.role_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin role cannot be changed",
        )
    role = db.query(Role).filter(Role.id == body.role_id, Role.company_id == cid).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    tu.role_id = role.id
    tu.role = role.slug
    db.commit()
    db.refresh(tu)
    return _out(tu)
