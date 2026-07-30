from __future__ import annotations

import json
from sqlalchemy.orm import Session
from app.models import Role, User, Company
from app.rbac_matrix import (
    default_matrix_admin,
    default_matrix_client_portal,
    default_matrix_staff_portal,
    MODULE_KEYS,
    wrap_matrix,
)


def _seed_rows():
    return [
        ("Admin", "admin", True, wrap_matrix(default_matrix_admin())),
        ("Client", "client", True, wrap_matrix(default_matrix_client_portal())),
        ("Staff", "staff", True, wrap_matrix(default_matrix_staff_portal())),
    ]


def prune_legacy_roles(db: Session, company_id: int) -> None:
    admin = get_role_by_slug(db, company_id, "admin")
    if not admin:
        ensure_roles_for_company(db, company_id)
        admin = get_role_by_slug(db, company_id, "admin")
    if not admin:
        return
    legacy = (
        db.query(Role)
        .filter(
            Role.company_id == company_id,
            Role.is_system.is_(True),
            Role.slug.notin_(["admin", "client", "staff"]),
        )
        .all()
    )
    for role in legacy:
        assigned = db.query(User.id).filter(User.role_id == role.id).first()
        if assigned:
            # Preserve existing users' access without keeping another fixed role.
            role.is_system = False
        else:
            db.delete(role)
    db.flush()


def ensure_roles_for_company(db: Session, company_id: int) -> None:
    from app.services.module_service import (
        ensure_app_modules,
        expand_coarse_matrix_to_app_modules,
        default_admin_app_matrix,
        list_active_modules,
        sync_role_permissions_from_matrix,
    )

    ensure_app_modules(db)
    modules = list_active_modules(db)
    for name, slug, is_sys, pj in _seed_rows():
        if get_role_by_slug(db, company_id, slug):
            continue
        db.add(
            Role(
                company_id=company_id,
                name=name,
                slug=slug,
                is_system=is_sys,
                permissions_json=pj,
            )
        )
    db.flush()
    for role in db.query(Role).filter(Role.company_id == company_id).all():
        if role.slug == "admin":
            sync_role_permissions_from_matrix(db, role, default_admin_app_matrix(modules))
        else:
            coarse = matrix_from_permissions_json(role.permissions_json)
            sync_role_permissions_from_matrix(db, role, expand_coarse_matrix_to_app_modules(coarse, modules))
    db.flush()


def ensure_roles_for_all_companies(db: Session) -> None:
    for row in db.query(Company.id).all():
        ensure_roles_for_company(db, row[0])
    db.flush()


def get_role_by_slug(db: Session, company_id: int, slug: str) -> Role | None:
    return db.query(Role).filter(Role.company_id == company_id, Role.slug == slug).first()


def backfill_user_roles(db: Session) -> None:
    ensure_roles_for_all_companies(db)
    for u in db.query(User).filter(User.company_id.isnot(None), User.role_id.is_(None)).all():
        slug = (u.role or "company_admin").lower().strip()
        if slug == "company_admin":
            slug = "admin"
        elif slug == "super_admin":
            continue
        r = get_role_by_slug(db, u.company_id, slug)
        if not r:
            r = get_role_by_slug(db, u.company_id, "admin")
        if r:
            u.role_id = r.id
            u.role = r.slug
    db.flush()
    for co in db.query(Company.id).all():
        prune_legacy_roles(db, co[0])
    db.commit()


def empty_matrix() -> dict:
    return {k: {"view": False, "create": False, "edit": False, "delete": False} for k in MODULE_KEYS}


def matrix_from_permissions_json(raw: str | None) -> dict:
    if not raw:
        return empty_matrix()
    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return empty_matrix()
    if not isinstance(d, dict):
        return empty_matrix()
    if "matrix" in d and isinstance(d["matrix"], dict):
        m = d["matrix"]
        base = empty_matrix()
        for k in MODULE_KEYS:
            if k in m and isinstance(m[k], dict):
                base[k] = {
                    "view": bool(m[k].get("view")),
                    "create": bool(m[k].get("create")),
                    "edit": bool(m[k].get("edit")),
                    "delete": bool(m[k].get("delete")),
                }
        return base
    return empty_matrix()


def permissions_is_matrix(raw: str | None) -> bool:
    if not raw:
        return False
    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return False
    return isinstance(d, dict) and "matrix" in d


def set_permissions_matrix(role: Role, matrix: dict, db: Session | None = None) -> None:
    from sqlalchemy.orm import object_session

    from app.services.module_service import sync_role_permissions_from_matrix

    role.permissions_json = wrap_matrix(matrix)
    session = db or object_session(role)
    if session is not None and role.id:
        sync_role_permissions_from_matrix(session, role, matrix)

