from __future__ import annotations

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth import get_current_user, SUPER_ADMIN_ROLE
from app.database import get_db
from app.models import User, Role

PERM_GUARDS_READ = "guards.read"
PERM_GUARDS_WRITE = "guards.write"
PERM_GUARDS_DELETE = "guards.delete"
PERM_SITES_READ = "sites.read"
PERM_SITES_WRITE = "sites.write"
PERM_SITES_DELETE = "sites.delete"
PERM_CLIENTS_READ = "clients.read"
PERM_CLIENTS_WRITE = "clients.write"
PERM_CLIENTS_DELETE = "clients.delete"
PERM_SUBS_READ = "subs.read"
PERM_SUBS_WRITE = "subs.write"
PERM_SUBS_DELETE = "subs.delete"
PERM_ASSIGN_READ = "assign.read"
PERM_ASSIGN_WRITE = "assign.write"
PERM_ASSIGN_DELETE = "assign.delete"
PERM_ATTEND_READ = "attend.read"
PERM_ATTEND_WRITE = "attend.write"
PERM_PAYROLL_READ = "payroll.read"
PERM_PAYROLL_WRITE = "payroll.write"
PERM_INV_READ = "inv.read"
PERM_INV_WRITE = "inv.write"
PERM_INV_DELETE = "inv.delete"
PERM_PAY_READ = "pay.read"
PERM_PAY_WRITE = "pay.write"
PERM_PAY_DELETE = "pay.delete"
PERM_ALLOW_READ = "allow.read"
PERM_ALLOW_WRITE = "allow.write"
PERM_ALLOW_DELETE = "allow.delete"
PERM_RATES_READ = "rates.read"
PERM_RATES_WRITE = "rates.write"
PERM_RATES_DELETE = "rates.delete"
PERM_DOC_READ = "doc.read"
PERM_DOC_WRITE = "doc.write"
PERM_DOC_DELETE = "doc.delete"
PERM_REP_READ = "rep.read"
PERM_EMAIL_SEND = "email.send"
PERM_SUB_READ = "sub.read"
PERM_SUB_MANAGE = "sub.manage"
PERM_ROLES_READ = "roles.read"
PERM_ROLES_WRITE = "roles.write"
PERM_ROLES_DELETE = "roles.delete"
PERM_CONTRACTOR_VIEW = "contractor:view"
PERM_CONTRACTOR_MANAGE = "contractor:manage"
PERM_CONTRACTOR_ASSIGN = "contractor:assign"
PERM_STAFF_REQ_READ = "staff_req.read"
PERM_STAFF_REQ_WRITE = "staff_req.write"
PERM_STAFF_REQ_REVIEW = "staff_req.review"
PERM_EXP_READ = "exp.read"
PERM_EXP_WRITE = "exp.write"
PERM_EXP_DELETE = "exp.delete"

ALL_PERMISSION_CODES: frozenset[str] = frozenset(
    {
        PERM_GUARDS_READ,
        PERM_GUARDS_WRITE,
        PERM_GUARDS_DELETE,
        PERM_SITES_READ,
        PERM_SITES_WRITE,
        PERM_SITES_DELETE,
        PERM_CLIENTS_READ,
        PERM_CLIENTS_WRITE,
        PERM_CLIENTS_DELETE,
        PERM_SUBS_READ,
        PERM_SUBS_WRITE,
        PERM_SUBS_DELETE,
        PERM_ASSIGN_READ,
        PERM_ASSIGN_WRITE,
        PERM_ASSIGN_DELETE,
        PERM_ATTEND_READ,
        PERM_ATTEND_WRITE,
        PERM_PAYROLL_READ,
        PERM_PAYROLL_WRITE,
        PERM_INV_READ,
        PERM_INV_WRITE,
        PERM_INV_DELETE,
        PERM_PAY_READ,
        PERM_PAY_WRITE,
        PERM_PAY_DELETE,
        PERM_ALLOW_READ,
        PERM_ALLOW_WRITE,
        PERM_ALLOW_DELETE,
        PERM_RATES_READ,
        PERM_RATES_WRITE,
        PERM_RATES_DELETE,
        PERM_DOC_READ,
        PERM_DOC_WRITE,
        PERM_DOC_DELETE,
        PERM_REP_READ,
        PERM_EMAIL_SEND,
        PERM_SUB_READ,
        PERM_SUB_MANAGE,
        PERM_ROLES_READ,
        PERM_ROLES_WRITE,
        PERM_ROLES_DELETE,
        PERM_CONTRACTOR_VIEW,
        PERM_CONTRACTOR_MANAGE,
        PERM_CONTRACTOR_ASSIGN,
        PERM_STAFF_REQ_READ,
        PERM_STAFF_REQ_WRITE,
        PERM_STAFF_REQ_REVIEW,
        PERM_EXP_READ,
        PERM_EXP_WRITE,
        PERM_EXP_DELETE,
    }
)

_SUPERVISOR = frozenset(
    {
        PERM_GUARDS_READ,
        PERM_SITES_READ,
        PERM_CLIENTS_READ,
        PERM_SUBS_READ,
        PERM_ASSIGN_READ,
        PERM_ASSIGN_WRITE,
        PERM_ATTEND_READ,
        PERM_ATTEND_WRITE,
        PERM_PAYROLL_READ,
        PERM_INV_READ,
        PERM_PAY_READ,
        PERM_ALLOW_READ,
        PERM_EXP_READ,
        PERM_RATES_READ,
        PERM_DOC_READ,
        PERM_REP_READ,
        PERM_SUB_READ,
        PERM_CONTRACTOR_VIEW,
        PERM_STAFF_REQ_READ,
        PERM_STAFF_REQ_REVIEW,
    }
)

_GUARD_LEGACY = frozenset(
    {
        PERM_GUARDS_READ,
        PERM_ASSIGN_READ,
        PERM_ATTEND_READ,
        PERM_ATTEND_WRITE,
        PERM_DOC_READ,
    }
)

_CLIENT_LEGACY = frozenset(
    {
        PERM_CLIENTS_READ,
        PERM_SITES_READ,
        PERM_ASSIGN_READ,
        PERM_INV_READ,
        PERM_PAY_READ,
        PERM_STAFF_REQ_READ,
        PERM_STAFF_REQ_WRITE,
    }
)

_MANAGER = frozenset(set(ALL_PERMISSION_CODES) - {PERM_CONTRACTOR_MANAGE})

_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "super_admin": ALL_PERMISSION_CODES,
    "company_admin": ALL_PERMISSION_CODES,
    "manager": _MANAGER,
    "supervisor": _SUPERVISOR,
    "guard": _GUARD_LEGACY,
    "client": _CLIENT_LEGACY,
}


def effective_role(user: User) -> str:
    r = (user.role or "company_admin").lower().strip()
    if r == "admin":
        r = "company_admin"
    if r not in _ROLE_PERMISSIONS:
        return "company_admin"
    return r


def user_has_permission(user: User, code: str) -> bool:
    if effective_role(user) == "super_admin":
        return True
    return code in _ROLE_PERMISSIONS[effective_role(user)]


def permissions_for_user(user: User) -> list[str]:
    if effective_role(user) == "super_admin":
        return sorted(ALL_PERMISSION_CODES)
    return sorted(_ROLE_PERMISSIONS[effective_role(user)])


def user_has_permission_db(db: Session, user: User, code: str) -> bool:
    if getattr(user, "role", None) == SUPER_ADMIN_ROLE:
        return True
    from app.rbac_matrix import permissions_json_to_codes

    if user.role_id:
        r = db.query(Role).filter(Role.id == user.role_id).first()
        if r and r.company_id == user.company_id:
            return code in permissions_json_to_codes(r.permissions_json)
    return user_has_permission(user, code)


def permissions_for_user_db(db: Session, user: User) -> list[str]:
    if getattr(user, "role", None) == SUPER_ADMIN_ROLE:
        return sorted(ALL_PERMISSION_CODES)
    from app.rbac_matrix import permissions_json_to_codes

    if user.role_id:
        r = db.query(Role).filter(Role.id == user.role_id).first()
        if r and r.company_id == user.company_id:
            return sorted(permissions_json_to_codes(r.permissions_json))
    return permissions_for_user(user)


def require_perm(code: str):
    def checker(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        if not user_has_permission_db(db, user, code):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return checker
