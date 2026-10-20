from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import User, Role
from app.rbac import require_module
from app.schemas import CompanyUserOut, UserRolePatch, CompanyUserCreate, CompanyUserUpdate, CompanyUserResetPassword
from app.services import membership_service, user_service

router = APIRouter(prefix="/users", tags=["users"])


def _require_company(user: User) -> int:
    if not user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return user.company_id


def _out(u: User, company_id: int, db: Session) -> CompanyUserOut:
    membership = membership_service.get_membership(db, u.id, company_id)
    role_id = membership.role_id if membership else u.role_id
    guard_id = membership.guard_id if membership else u.guard_id
    client_id = membership.client_id if membership else u.client_id
    rr = db.query(Role).filter(Role.id == role_id).first() if role_id else None
    site_ids = sorted(p.site_id for p in u.site_pins if p.company_id == company_id)
    return CompanyUserOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role_id=role_id,
        role_slug=rr.slug if rr else (membership.role if membership else None),
        role_name=rr.name if rr else None,
        client_id=client_id,
        guard_id=guard_id,
        site_ids=site_ids,
    )


@router.get("", response_model=list[CompanyUserOut])
def list_company_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("roles", "users_view")),
):
    cid = _require_company(current_user)
    # Eager-load the pins; _out reads them for every row, which would otherwise be a
    # query per user on a page that lists the whole company.
    ids = membership_service.user_ids_in_company(db, cid)
    if not ids:
        return []
    rows = (
        db.query(User)
        .options(selectinload(User.site_pins))
        .filter(User.id.in_(ids))
        .order_by(User.email)
        .all()
    )
    return [_out(u, cid, db) for u in rows]


@router.get("/{user_id}", response_model=CompanyUserOut)
def get_company_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("roles", "users_view")),
):
    cid = _require_company(current_user)
    return _out(user_service._get_user(db, cid, user_id), cid, db)


@router.post("", response_model=CompanyUserOut, status_code=status.HTTP_201_CREATED)
def create_company_user(
    body: CompanyUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("roles", "users_create")),
):
    cid = _require_company(current_user)
    u = user_service.create_company_user(db, cid, body)
    return _out(u, cid, db)


@router.put("/{user_id}", response_model=CompanyUserOut)
def update_company_user(
    user_id: int,
    body: CompanyUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("roles", "users_edit")),
):
    cid = _require_company(current_user)
    u = user_service.update_company_user(db, cid, user_id, body)
    return _out(u, cid, db)


@router.post("/{user_id}/reset-password", response_model=CompanyUserOut)
def reset_company_user_password(
    user_id: int,
    body: CompanyUserResetPassword,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("roles", "users_reset_password")),
):
    cid = _require_company(current_user)
    u = user_service.reset_company_user_password(db, cid, user_id, body.new_password)
    return _out(u, cid, db)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("roles", "users_delete")),
):
    cid = _require_company(current_user)
    user_service.delete_company_user(db, cid, user_id, current_user.id)


@router.patch("/{user_id}/role", response_model=CompanyUserOut)
def patch_user_role(
    user_id: int,
    body: UserRolePatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("roles", "users_assign_role")),
):
    cid = _require_company(current_user)
    tu = user_service._get_user(db, cid, user_id)
    membership = membership_service.get_membership(db, tu.id, cid)
    current_role_id = membership.role_id if membership else tu.role_id
    current_role = db.query(Role).filter(Role.id == current_role_id).first() if current_role_id else None
    if current_role and current_role.slug == "admin" and body.role_id != current_role_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin role cannot be changed",
        )
    role = db.query(Role).filter(Role.id == body.role_id, Role.company_id == cid).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if role.slug == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only one Admin is allowed. Assign a custom role instead.",
        )
    membership_service.upsert_membership(
        db,
        user=tu,
        company_id=cid,
        role=role,
        guard_id=membership.guard_id if membership else tu.guard_id,
        client_id=membership.client_id if membership else tu.client_id,
        make_active_context=tu.company_id == cid,
    )
    db.commit()
    db.refresh(tu)
    return _out(tu, cid, db)
