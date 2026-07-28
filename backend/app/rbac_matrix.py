from __future__ import annotations

import json
from typing import Any, Dict, FrozenSet, Optional

from app.rbac import (
    PERM_ALLOW_DELETE,
    PERM_ALLOW_READ,
    PERM_ALLOW_WRITE,
    PERM_ASSIGN_DELETE,
    PERM_ASSIGN_READ,
    PERM_ASSIGN_WRITE,
    PERM_ATTEND_READ,
    PERM_ATTEND_WRITE,
    PERM_CLIENTS_DELETE,
    PERM_CLIENTS_READ,
    PERM_CLIENTS_WRITE,
    PERM_DOC_DELETE,
    PERM_DOC_READ,
    PERM_DOC_WRITE,
    PERM_EMAIL_SEND,
    PERM_EXP_DELETE,
    PERM_EXP_READ,
    PERM_EXP_WRITE,
    PERM_GUARDS_DELETE,
    PERM_GUARDS_READ,
    PERM_GUARDS_WRITE,
    PERM_INV_DELETE,
    PERM_INV_READ,
    PERM_INV_WRITE,
    PERM_PAY_DELETE,
    PERM_PAY_READ,
    PERM_PAY_WRITE,
    PERM_PAYROLL_READ,
    PERM_PAYROLL_WRITE,
    PERM_RATES_DELETE,
    PERM_RATES_READ,
    PERM_RATES_WRITE,
    PERM_REP_READ,
    PERM_ROLES_DELETE,
    PERM_ROLES_READ,
    PERM_ROLES_WRITE,
    PERM_SITES_DELETE,
    PERM_SITES_READ,
    PERM_SITES_WRITE,
    PERM_SUB_MANAGE,
    PERM_SUB_READ,
    PERM_SUBS_DELETE,
    PERM_SUBS_READ,
    PERM_SUBS_WRITE,
    PERM_CONTRACTOR_ASSIGN,
    PERM_CONTRACTOR_MANAGE,
    PERM_CONTRACTOR_VIEW,
    PERM_STAFF_REQ_READ,
    PERM_STAFF_REQ_WRITE,
    PERM_STAFF_REQ_REVIEW,
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
)

MODULE_KEYS = (
    "clients",
    "sites",
    "guards",
    "rota",
    "invoices",
    "contractors",
    "reports",
    "settings",
    "contractor_registry",
    "contractor_links",
    "staff_requests",
    "leads",
    "portal",
    "patrol",
    "incidents",
)


def _cell(m: Dict[str, Any], mod: str) -> Dict[str, bool]:
    c = m.get(mod) or {}
    return {
        "view": bool(c.get("view")),
        "create": bool(c.get("create")),
        "edit": bool(c.get("edit")),
        "delete": bool(c.get("delete")),
    }


def matrix_to_codes(m: Optional[Dict[str, Any]]) -> FrozenSet[str]:
    if not m:
        return frozenset()
    out: set[str] = set()
    for mod in MODULE_KEYS:
        x = _cell(m, mod)
        v, c, e, d = x["view"], x["create"], x["edit"], x["delete"]
        if mod == "clients":
            if v:
                out.add(PERM_CLIENTS_READ)
            if c or e:
                out.add(PERM_CLIENTS_WRITE)
            if d:
                out.add(PERM_CLIENTS_DELETE)
        elif mod == "sites":
            if v:
                out.add(PERM_SITES_READ)
            if c or e:
                out.add(PERM_SITES_WRITE)
            if d:
                out.add(PERM_SITES_DELETE)
        elif mod == "guards":
            if v:
                out.add(PERM_GUARDS_READ)
            if c or e:
                out.add(PERM_GUARDS_WRITE)
            if d:
                out.add(PERM_GUARDS_DELETE)
        elif mod == "rota":
            if v:
                out.add(PERM_ASSIGN_READ)
                out.add(PERM_ATTEND_READ)
            if c:
                out.add(PERM_ASSIGN_WRITE)
            if e:
                out.add(PERM_ATTEND_WRITE)
                out.add(PERM_ASSIGN_WRITE)
            if d:
                out.add(PERM_ASSIGN_DELETE)
        elif mod == "invoices":
            if v:
                out.update([PERM_INV_READ, PERM_PAY_READ, PERM_PAYROLL_READ, PERM_EXP_READ])
            if c or e:
                out.update([PERM_INV_WRITE, PERM_PAY_WRITE, PERM_PAYROLL_WRITE, PERM_EXP_WRITE])
            if d:
                out.update([PERM_INV_DELETE, PERM_PAY_DELETE, PERM_EXP_DELETE])
        elif mod == "contractors":
            if v:
                out.add(PERM_SUBS_READ)
            if c or e:
                out.add(PERM_SUBS_WRITE)
            if d:
                out.add(PERM_SUBS_DELETE)
        elif mod == "reports":
            if v or c or e or d:
                out.add(PERM_REP_READ)
        elif mod == "settings":
            if v:
                out.update(
                    [
                        PERM_ALLOW_READ,
                        PERM_RATES_READ,
                        PERM_DOC_READ,
                        PERM_ATTEND_READ,
                        PERM_SUB_READ,
                        PERM_ROLES_READ,
                    ]
                )
            if c or e:
                out.update(
                    [
                        PERM_ALLOW_WRITE,
                        PERM_RATES_WRITE,
                        PERM_DOC_WRITE,
                        PERM_ATTEND_WRITE,
                        PERM_SUB_MANAGE,
                        PERM_EMAIL_SEND,
                        PERM_ROLES_WRITE,
                    ]
                )
            if d:
                out.update([PERM_ALLOW_DELETE, PERM_RATES_DELETE, PERM_DOC_DELETE, PERM_ROLES_DELETE])
        elif mod == "contractor_registry":
            if v:
                out.add(PERM_CONTRACTOR_VIEW)
            if c or e or d:
                out.add(PERM_CONTRACTOR_MANAGE)
        elif mod == "contractor_links":
            if v:
                out.add(PERM_CONTRACTOR_VIEW)
            if c or e or d:
                out.add(PERM_CONTRACTOR_ASSIGN)
        elif mod == "staff_requests":
            if v:
                out.add(PERM_STAFF_REQ_READ)
            if c:
                out.add(PERM_STAFF_REQ_WRITE)
            if e:
                out.add(PERM_STAFF_REQ_REVIEW)
            if d:
                out.add(PERM_STAFF_REQ_REVIEW)
        elif mod == "leads":
            if v:
                out.update([PERM_LEADS_READ, PERM_LEADS_REPORTS, PERM_LEADS_EXPORT])
            if c or e:
                out.update([PERM_LEADS_WRITE, PERM_LEADS_ASSIGN])
            if d:
                out.add(PERM_LEADS_DELETE)
        elif mod == "portal":
            if v:
                out.update([PERM_PORTAL_SITES, PERM_PORTAL_ROTA_CURRENT, PERM_PORTAL_HOURS])
            if c:
                out.add(PERM_PORTAL_ROTA_UPCOMING)
            if e:
                out.add(PERM_PORTAL_ROTA_PREVIOUS)
        elif mod == "patrol":
            if v:
                out.update([PERM_PATROL_READ, PERM_PATROL_REPORTS])
            if c or e:
                out.add(PERM_PATROL_WRITE)
            if e:
                out.add(PERM_PATROL_SCAN)
        elif mod == "incidents":
            if v:
                out.update([PERM_INCIDENT_READ, PERM_INCIDENT_REPORTS])
            if c or e:
                out.add(PERM_INCIDENT_WRITE)
    return frozenset(out)


def default_matrix_admin() -> Dict[str, Any]:
    return {k: {"view": True, "create": True, "edit": True, "delete": True} for k in MODULE_KEYS}


def default_matrix_manager() -> Dict[str, Any]:
    m = {k: {"view": True, "create": True, "edit": True, "delete": True} for k in MODULE_KEYS}
    m["contractor_registry"] = {"view": True, "create": False, "edit": False, "delete": False}
    return m


def default_matrix_supervisor() -> Dict[str, Any]:
    return {
        "clients": {"view": True, "create": False, "edit": False, "delete": False},
        "sites": {"view": True, "create": False, "edit": False, "delete": False},
        "guards": {"view": True, "create": False, "edit": False, "delete": False},
        "rota": {"view": True, "create": True, "edit": True, "delete": False},
        "invoices": {"view": True, "create": False, "edit": False, "delete": False},
        "contractors": {"view": True, "create": False, "edit": False, "delete": False},
        "reports": {"view": True, "create": False, "edit": False, "delete": False},
        "settings": {"view": True, "create": False, "edit": False, "delete": False},
        "contractor_registry": {"view": True, "create": False, "edit": False, "delete": False},
        "contractor_links": {"view": True, "create": False, "edit": False, "delete": False},
        "staff_requests": {"view": True, "create": False, "edit": True, "delete": False},
        "leads": {"view": False, "create": False, "edit": False, "delete": False},
        "portal": {"view": False, "create": False, "edit": False, "delete": False},
        "patrol": {"view": True, "create": True, "edit": True, "delete": False},
        "incidents": {"view": True, "create": True, "edit": True, "delete": False},
    }


def default_matrix_guard() -> Dict[str, Any]:
    return {
        "clients": {"view": False, "create": False, "edit": False, "delete": False},
        "sites": {"view": False, "create": False, "edit": False, "delete": False},
        "guards": {"view": True, "create": False, "edit": False, "delete": False},
        "rota": {"view": True, "create": False, "edit": True, "delete": False},
        "invoices": {"view": False, "create": False, "edit": False, "delete": False},
        "contractors": {"view": False, "create": False, "edit": False, "delete": False},
        "reports": {"view": False, "create": False, "edit": False, "delete": False},
        "settings": {"view": False, "create": False, "edit": False, "delete": False},
        "contractor_registry": {"view": False, "create": False, "edit": False, "delete": False},
        "contractor_links": {"view": False, "create": False, "edit": False, "delete": False},
        "staff_requests": {"view": False, "create": False, "edit": False, "delete": False},
        "leads": {"view": False, "create": False, "edit": False, "delete": False},
        "portal": {"view": False, "create": False, "edit": False, "delete": False},
        "patrol": {"view": True, "create": False, "edit": True, "delete": False},
        "incidents": {"view": True, "create": True, "edit": False, "delete": False},
    }


def default_matrix_client_portal() -> Dict[str, Any]:
    base = {k: {"view": False, "create": False, "edit": False, "delete": False} for k in MODULE_KEYS}
    base["portal"] = {"view": True, "create": False, "edit": False, "delete": False}
    base["staff_requests"] = {"view": True, "create": True, "edit": False, "delete": False}
    base["patrol"] = {"view": True, "create": False, "edit": False, "delete": False}
    base["incidents"] = {"view": True, "create": True, "edit": False, "delete": False}
    return base


def default_matrix_staff_portal() -> Dict[str, Any]:
    base = {k: {"view": False, "create": False, "edit": False, "delete": False} for k in MODULE_KEYS}
    base["portal"] = {"view": True, "create": True, "edit": True, "delete": False}
    base["patrol"] = {"view": True, "create": False, "edit": True, "delete": False}
    base["incidents"] = {"view": True, "create": True, "edit": False, "delete": False}
    return base


def matrix_json_dumps(m: Dict[str, Any]) -> str:
    return json.dumps(m, sort_keys=True)


def permissions_json_to_codes(raw: Optional[str]) -> FrozenSet[str]:
    if not raw:
        return frozenset()
    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return frozenset()
    if isinstance(d, dict) and "codes" in d and isinstance(d["codes"], list):
        return frozenset(str(x) for x in d["codes"])
    if isinstance(d, dict) and "matrix" in d:
        return matrix_to_codes(d["matrix"])
    return matrix_to_codes(d if isinstance(d, dict) else {})


def wrap_matrix(m: Dict[str, Any]) -> str:
    return json.dumps({"matrix": m}, sort_keys=True)


def wrap_codes(codes: list[str]) -> str:
    return json.dumps({"codes": codes}, sort_keys=True)
