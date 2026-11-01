from __future__ import annotations

from fastapi import Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_super_admin, get_password_hash
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
        if role:
            codes.update(_role_codes(db, role))
    return codes


def _has_full_access(db: Session, user: User) -> bool:
    return {p[2] for p in ext.PLATFORM_PERMS} <= user_platform_permission_codes(db, user)


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


def _all_codes() -> set[str]:
    return {p[2] for p in ext.PLATFORM_PERMS}


def _role_codes(db: Session, role: PlatformRole) -> set[str]:
    if role.slug == "super_admin":
        return _all_codes()
    perms = (
        db.query(PlatformPermission)
        .join(PlatformRolePermission, PlatformRolePermission.permission_id == PlatformPermission.id)
        .filter(PlatformRolePermission.role_id == role.id)
        .all()
    )
    return {p.code for p in perms}


def _get_role(db: Session, role_slug: str) -> PlatformRole:
    role = db.query(PlatformRole).filter(PlatformRole.slug == role_slug).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


def _other_full_admins(db: Session, user: User) -> list[User]:
    return [
        u
        for u in db.query(User).filter(User.role == "super_admin", User.is_active.is_(True), User.id != user.id)
        if _has_full_access(db, u)
    ]


def _check_can_grant(db: Session, actor: User | None, role: PlatformRole) -> None:
    # Nobody can hand out access they do not hold themselves.
    if actor is None or _has_full_access(db, actor):
        return
    if role.slug == "super_admin":
        raise HTTPException(status_code=403, detail="Only Super Admin can assign the Super Admin role")
    missing = _role_codes(db, role) - user_platform_permission_codes(db, actor)
    if missing:
        raise HTTPException(
            status_code=403,
            detail=f"You cannot grant permissions you do not have: {', '.join(sorted(missing))}",
        )


def _check_can_manage(db: Session, actor: User | None, user: User) -> None:
    if actor is None or _has_full_access(db, actor):
        return
    if actor.id == user.id:
        raise HTTPException(status_code=403, detail="You cannot change your own platform role")
    if _has_full_access(db, user):
        raise HTTPException(status_code=403, detail="Only Super Admin can change another Super Admin")


def _get_platform_admin(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role != "super_admin":
        raise HTTPException(status_code=400, detail="User must be a platform admin")
    return user


def assign_platform_role(db: Session, user_id: int, role_slug: str, actor: User | None = None) -> dict:
    ext.ensure_platform_rbac(db)
    user = _get_platform_admin(db, user_id)
    role = _get_role(db, role_slug)
    _check_can_manage(db, actor, user)
    _check_can_grant(db, actor, role)
    # A first explicit role replaces the legacy full access a bare super_admin has, so
    # giving the last full admin a narrower role would lock billing and config for good.
    if role_slug != "super_admin" and _has_full_access(db, user) and not _other_full_admins(db, user):
        raise HTTPException(
            status_code=400,
            detail="This is the only Super Admin. Giving it a narrower role would remove billing and settings access. Add another Super Admin first.",
        )
    existing = (
        db.query(PlatformAdminRole)
        .filter(PlatformAdminRole.user_id == user_id, PlatformAdminRole.role_id == role.id)
        .first()
    )
    if not existing:
        db.add(PlatformAdminRole(user_id=user_id, role_id=role.id))
        db.commit()
    return {"user_id": user_id, "role": role_slug}


def set_platform_role(db: Session, user_id: int, role_slug: str, actor: User | None = None) -> dict:
    """Make role_slug the admin's only platform role."""
    ext.ensure_platform_rbac(db)
    user = _get_platform_admin(db, user_id)
    role = _get_role(db, role_slug)
    _check_can_manage(db, actor, user)
    _check_can_grant(db, actor, role)
    if role_slug != "super_admin" and _has_full_access(db, user) and not _other_full_admins(db, user):
        raise HTTPException(
            status_code=400,
            detail="This is the only Super Admin. Giving it a narrower role would remove billing and settings access. Add another Super Admin first.",
        )
    before = sorted(
        r.slug
        for r in db.query(PlatformRole)
        .join(PlatformAdminRole, PlatformAdminRole.role_id == PlatformRole.id)
        .filter(PlatformAdminRole.user_id == user_id)
    )
    db.query(PlatformAdminRole).filter(PlatformAdminRole.user_id == user_id).delete(synchronize_session=False)
    db.add(PlatformAdminRole(user_id=user_id, role_id=role.id))
    db.commit()
    return {"user_id": user_id, "role": role_slug, "previous_roles": before}


def create_platform_admin(
    db: Session,
    *,
    email: str,
    full_name: str,
    password: str,
    role_slug: str,
    actor: User | None = None,
) -> User:
    ext.ensure_platform_rbac(db)
    role = _get_role(db, role_slug)
    _check_can_grant(db, actor, role)
    email = email.strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    user = User(
        email=email,
        full_name=full_name.strip(),
        password_hash=get_password_hash(password),
        role="super_admin",
        company_id=None,
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    db.flush()
    # Always store an explicit role, so a new admin never falls back to legacy full access.
    db.add(PlatformAdminRole(user_id=user.id, role_id=role.id))
    db.commit()
    db.refresh(user)
    return user


def set_platform_admin_active(db: Session, user_id: int, is_active: bool, actor: User | None = None) -> User:
    user = _get_platform_admin(db, user_id)
    _check_can_manage(db, actor, user)
    if not is_active:
        if actor is not None and actor.id == user.id:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
        if _has_full_access(db, user) and not _other_full_admins(db, user):
            raise HTTPException(status_code=400, detail="Cannot deactivate the only active Super Admin")
    user.is_active = is_active
    db.commit()
    db.refresh(user)
    return user


def list_platform_admins(db: Session) -> list[dict]:
    ext.ensure_platform_rbac(db)
    out = []
    for u in db.query(User).filter(User.role == "super_admin").order_by(User.id).all():
        roles = (
            db.query(PlatformRole)
            .join(PlatformAdminRole, PlatformAdminRole.role_id == PlatformRole.id)
            .filter(PlatformAdminRole.user_id == u.id)
            .order_by(PlatformRole.id)
            .all()
        )
        codes = user_platform_permission_codes(db, u)
        out.append(
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "is_active": bool(u.is_active),
                "created_at": u.created_at,
                "roles": [{"slug": r.slug, "name": r.name} for r in roles],
                # No role rows = legacy full access.
                "legacy_full_access": not roles,
                "full_access": codes >= _all_codes(),
                "permission_count": len(codes),
            }
        )
    return out


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
