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
PERM_LEADS_READ = "leads.read"
PERM_LEADS_WRITE = "leads.write"
PERM_LEADS_DELETE = "leads.delete"
PERM_LEADS_ASSIGN = "leads.assign"
PERM_LEADS_EXPORT = "leads.export"
PERM_LEADS_REPORTS = "leads.reports"
PERM_PORTAL_SITES = "portal.sites.read"
PERM_PORTAL_ROTA_CURRENT = "portal.rota.current"
PERM_PORTAL_ROTA_UPCOMING = "portal.rota.upcoming"
PERM_PORTAL_ROTA_PREVIOUS = "portal.rota.previous"
PERM_PORTAL_HOURS = "portal.hours.read"
PERM_PATROL_READ = "patrol.read"
PERM_PATROL_WRITE = "patrol.write"
PERM_PATROL_SCAN = "patrol.scan"
PERM_PATROL_REPORTS = "patrol.reports"
PERM_INCIDENT_READ = "incident.read"
PERM_INCIDENT_WRITE = "incident.write"
PERM_INCIDENT_REPORTS = "incident.reports"
PERM_ROTA_VIEW = "rota.view"
PERM_ROTA_CREATE = "rota.create"
PERM_ROTA_EDIT = "rota.edit"
PERM_ROTA_DELETE = "rota.delete"

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
        PERM_LEADS_READ,
        PERM_LEADS_WRITE,
        PERM_LEADS_DELETE,
        PERM_LEADS_ASSIGN,
        PERM_LEADS_EXPORT,
        PERM_LEADS_REPORTS,
        PERM_PORTAL_SITES,
        PERM_PORTAL_ROTA_CURRENT,
        PERM_PORTAL_ROTA_UPCOMING,
        PERM_PORTAL_ROTA_PREVIOUS,
        PERM_PORTAL_HOURS,
        PERM_PATROL_READ,
        PERM_PATROL_WRITE,
        PERM_PATROL_SCAN,
        PERM_PATROL_REPORTS,
        PERM_INCIDENT_READ,
        PERM_INCIDENT_WRITE,
        PERM_INCIDENT_REPORTS,
        PERM_ROTA_VIEW,
        PERM_ROTA_CREATE,
        PERM_ROTA_EDIT,
        PERM_ROTA_DELETE,
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
        PERM_PATROL_READ,
        PERM_PATROL_WRITE,
        PERM_PATROL_REPORTS,
        PERM_INCIDENT_READ,
        PERM_INCIDENT_WRITE,
        PERM_INCIDENT_REPORTS,
    }
)

_GUARD_LEGACY = frozenset(
    {
        PERM_GUARDS_READ,
        PERM_ASSIGN_READ,
        PERM_ATTEND_READ,
        PERM_ATTEND_WRITE,
        PERM_DOC_READ,
        PERM_PATROL_SCAN,
        PERM_PATROL_READ,
        PERM_INCIDENT_WRITE,
        PERM_INCIDENT_READ,
    }
)

_CLIENT_LEGACY = frozenset(
    {
        PERM_PORTAL_SITES,
        PERM_PORTAL_ROTA_CURRENT,
        PERM_PORTAL_HOURS,
        PERM_STAFF_REQ_READ,
        PERM_STAFF_REQ_WRITE,
        PERM_PATROL_REPORTS,
        PERM_INCIDENT_READ,
        PERM_INCIDENT_WRITE,
    }
)

_STAFF_LEGACY = frozenset(
    {
        PERM_PORTAL_SITES,
        PERM_PORTAL_ROTA_CURRENT,
        PERM_PORTAL_ROTA_UPCOMING,
        PERM_PORTAL_ROTA_PREVIOUS,
        PERM_PORTAL_HOURS,
        PERM_PATROL_SCAN,
        PERM_PATROL_READ,
        PERM_INCIDENT_WRITE,
        PERM_INCIDENT_READ,
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
    "staff": _STAFF_LEGACY,
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


# Module-scoped permission codes (database-driven matrix)

_ADMIN_ROLE_STRINGS = frozenset({"admin", "company_admin", "super_admin"})


def permission_bypass(db: Session, user: User) -> bool:
    """Whether this user skips permission checks entirely.

    A user bound to a Role row is governed by that row and nothing else — only the
    built-in ``admin`` role bypasses. This must not go through
    :func:`effective_role`, which maps any unrecognised role string to
    ``company_admin``: because ``User.role`` is set to the role's slug when a custom
    role is assigned, routing custom slugs through it would hand every custom-role
    user a full bypass and silently disable the permission matrix.

    The role-string check below is the fallback for legacy users that were never
    given a ``role_id``, and matches admin strings exactly.
    """
    if getattr(user, "role", None) == SUPER_ADMIN_ROLE:
        return True
    if user.role_id:
        r = db.query(Role).filter(Role.id == user.role_id).first()
        return bool(r and r.slug == "admin")
    return (user.role or "").lower().strip() in _ADMIN_ROLE_STRINGS


def _codes_with_inheritance(code: str) -> list[str]:
    """A permission code plus the coarse codes it may be satisfied by.

    ``rota.publish`` is satisfied by an explicit ``rota.publish`` grant, and failing
    that by ``rota.edit`` — the action that gated it before granular permissions
    existed. This keeps role rows written by an older build authorising correctly, and
    keeps the static legacy role sets in ``_ROLE_PERMISSIONS`` usable, without needing
    every stored row to be rewritten first.
    """
    from app.module_actions import parent_chain

    if "." not in code:
        return [code]
    module_key, _, action = code.rpartition(".")
    return [code] + [f"{module_key}.{a}" for a in parent_chain(module_key, action)]


def _is_catalogue_action(code: str) -> bool:
    from app.module_actions import MODULE_ACTIONS, module_has_action

    module_key, _, action = code.rpartition(".")
    return module_key in MODULE_ACTIONS and module_has_action(module_key, action)


def user_has_permission_db(db: Session, user: User, code: str) -> bool:
    if permission_bypass(db, user):
        return True
    if user.role_id and _is_catalogue_action(code):
        # Resolve a catalogue action from the role's own grants and nothing else.
        #
        # permissions_for_user_db returns one flat bag mixing granular module.action
        # codes with the legacy PERM_* strings, and fourteen of the legacy strings were
        # named in the same namespace — "rota.edit", "rota.view", "patrol.scan",
        # "leads.export", "guards.delete"… Those are emitted whenever a *descendant*
        # action is granted, so reading this decision out of the bag let a role holding
        # only rota.publish satisfy the rota.edit its admin had explicitly switched off.
        # The role's stored action rows carry no such ambiguity.
        from app.services.module_service import role_action_allowed

        module_key, _, action = code.rpartition(".")
        return role_action_allowed(db, user, module_key, action)
    granted = set(permissions_for_user_db(db, user))
    if code in granted:
        return True
    return any(c in granted for c in _codes_with_inheritance(code))


def permissions_for_user_db(db: Session, user: User) -> list[str]:
    if permission_bypass(db, user):
        from app.services.module_service import all_module_action_codes

        codes = set(ALL_PERMISSION_CODES)
        codes.update(all_module_action_codes(db))
        return sorted(codes)
    from app.services.module_service import module_permission_codes_for_role

    if user.role_id:
        r = db.query(Role).filter(Role.id == user.role_id).first()
        if r and r.company_id == user.company_id:
            # The role's grants are authoritative, empty set included. Falling back to
            # the static legacy sets here would resolve an unrecognised slug to
            # company_admin and hand a deliberately locked-down role every permission.
            return sorted(module_permission_codes_for_role(db, r.id))
        return []
    return permissions_for_user(user)


def require_module(module_key: str, action: str):
    """Check permission for module action (e.g. rota + publish -> rota.publish).

    Special actions fall back to the coarse action they descend from, so a role that
    predates the granular catalogue still passes.
    """

    def checker(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        code = f"{module_key}.{action}"
        if not user_has_permission_db(db, user, code):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return checker


def require_internal_module(module_key: str, action: str):
    """require_module, plus a hard refusal for the outward-facing portal roles.

    Most modules are staff-only back office: the guard directory, payroll, expenses,
    leads, other clients' records. Their services filter by company but not by client,
    so if one of these modules were ever ticked on for the Client or Staff role — by
    mistake or by someone assuming it would scope itself — that login would read the
    whole tenant. Blocking at the router keeps that decision out of the matrix instead
    of relying on every service to defend itself.

    Client- and staff-facing modules (my_portal, client_portal, staff_requests,
    incidents, patrol, sites, invoices) deliberately keep plain require_module and
    scope their own queries instead.
    """
    base = require_module(module_key, action)

    def checker(user: User = Depends(base), db: Session = Depends(get_db)) -> User:
        from app.services.portal_access import is_portal_role

        if is_portal_role(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return checker


def require_perm(code: str):
    def checker(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        if not user_has_permission_db(db, user, code):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return checker
