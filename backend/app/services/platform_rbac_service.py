from __future__ import annotations

from functools import wraps
from typing import Callable, Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_super_admin
from app.database import get_db
from app.models import PlatformAdminRole, PlatformPermission, PlatformRole, PlatformRolePermission, User
from app.services import admin_platform_ext_service as ext


def user_platform_permission_codes(db: Session, user: User) -> set[str]:
    ext.ensure_platform_rbac(db)
    links = db.query(PlatformAdminRole).filter(PlatformAdminRole.user_id == user.id).all()
    if not links:
        # Legacy: bare super_admin with no platform role row has full access.
        if getattr(user, "role", None) == "super_admin":
            return {p[2] for p in ext.PLATFORM_PERMS}
        return set()
    codes: set[str] = set()
    for link in links:
        role = db.query(PlatformRole).filter(PlatformRole.id == link.role_id).first()
        if role and role.slug == "super_admin":
            return {p[2] for p in ext.PLATFORM_PERMS}
        perms = (
            db.query(PlatformPermission)
            .join(PlatformRolePermission, PlatformRolePermission.permission_id == PlatformPermission.id)
            .filter(PlatformRolePermission.role_id == link.role_id)
            .all()
        )
        codes.update(p.code for p in perms)
    return codes


def require_platform_perm(*codes: str):
    def dependency(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_super_admin),
    ) -> User:
        have = user_platform_permission_codes(db, user)
        if not codes:
            return user
        if not any(c in have for c in codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing platform permission: {', '.join(codes)}",
            )
        return user

    return dependency


def assign_platform_role(db: Session, user_id: int, role_slug: str) -> dict:
    ext.ensure_platform_rbac(db)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role != "super_admin":
        raise HTTPException(status_code=400, detail="User must be a platform admin")
    role = db.query(PlatformRole).filter(PlatformRole.slug == role_slug).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    existing = (
        db.query(PlatformAdminRole)
        .filter(PlatformAdminRole.user_id == user_id, PlatformAdminRole.role_id == role.id)
        .first()
    )
    if not existing:
        db.add(PlatformAdminRole(user_id=user_id, role_id=role.id))
        db.commit()
    return {"user_id": user_id, "role": role_slug}


def list_admin_role_assignments(db: Session) -> list[dict]:
    ext.ensure_platform_rbac(db)
    rows = db.query(PlatformAdminRole).all()
    out = []
    for r in rows:
        u = db.query(User).filter(User.id == r.user_id).first()
        role = db.query(PlatformRole).filter(PlatformRole.id == r.role_id).first()
        out.append(
            {
                "user_id": r.user_id,
                "email": u.email if u else None,
                "full_name": u.full_name if u else None,
                "role_id": r.role_id,
                "role_slug": role.slug if role else None,
                "role_name": role.name if role else None,
                "assigned_at": r.assigned_at,
            }
        )
    return out
