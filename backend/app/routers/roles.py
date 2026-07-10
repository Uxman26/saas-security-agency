from __future__ import annotations

import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Role, User
from app.rbac import require_perm, PERM_ROLES_READ, PERM_ROLES_WRITE, PERM_ROLES_DELETE
from app.schemas import RoleOut, RoleCreate, RoleUpdate
from app.services.role_service import matrix_from_permissions_json, permissions_is_matrix, set_permissions_matrix

router = APIRouter(prefix="/roles", tags=["roles"])

RESERVED_SLUGS = frozenset({"admin"})


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48]
    return s or "role"


def unique_slug(db: Session, company_id: int, base: str) -> str:
    s = base
    n = 0
    while db.query(Role).filter(Role.company_id == company_id, Role.slug == s).first():
        n += 1
        s = f"{base}-{n}"
    return s


def _out(r: Role) -> RoleOut:
    return RoleOut(
        id=r.id,
        company_id=r.company_id,
        name=r.name,
        slug=r.slug,
        is_system=r.is_system,
        matrix=matrix_from_permissions_json(r.permissions_json),
        uses_matrix=permissions_is_matrix(r.permissions_json),
    )


def _require_company(user: User) -> int:
    if not user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return user.company_id


@router.get("", response_model=list[RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_READ)),
):
    cid = _require_company(current_user)
    rows = db.query(Role).filter(Role.company_id == cid).order_by(Role.name).all()
    return [_out(r) for r in rows]


@router.post("", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(
    body: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_WRITE)),
):
    cid = _require_company(current_user)
    base = slugify(body.name)
    if base in RESERVED_SLUGS:
        base = f"{base}-custom"
    slug = unique_slug(db, cid, base)
    r = Role(
        company_id=cid,
        name=body.name.strip(),
        slug=slug,
        is_system=False,
        permissions_json="{}",
    )
    set_permissions_matrix(r, body.matrix)
    db.add(r)
    db.commit()
    db.refresh(r)
    return _out(r)


@router.put("/{role_id}", response_model=RoleOut)
def update_role(
    role_id: int,
    body: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_WRITE)),
):
    cid = _require_company(current_user)
    r = db.query(Role).filter(Role.id == role_id, Role.company_id == cid).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if r.is_system or r.slug == "admin":
        if body.matrix is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change Admin role permissions")
        if body.name is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot rename Admin role")
    else:
        if body.name is not None:
            r.name = body.name.strip()
        if body.matrix is not None:
            set_permissions_matrix(r, body.matrix)
    db.commit()
    db.refresh(r)
    return _out(r)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ROLES_DELETE)),
):
    cid = _require_company(current_user)
    r = db.query(Role).filter(Role.id == role_id, Role.company_id == cid).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if r.is_system or r.slug == "admin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete Admin role")
    n = db.query(User).filter(User.role_id == role_id).count()
    if n:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role is assigned to users")
    db.delete(r)
    db.commit()
