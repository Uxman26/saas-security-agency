#!/usr/bin/env python3
"""One-off: migrate router require_perm(PERM_*) to require_module(key, action)."""
from __future__ import annotations

import re
from pathlib import Path

ROUTERS = Path(__file__).resolve().parent.parent / "app" / "routers"

# PERM constant -> (module_key, action)
PERM_MAP: dict[str, tuple[str, str]] = {
    "PERM_GUARDS_READ": ("guards", "view"),
    "PERM_GUARDS_WRITE": ("guards", "edit"),
    "PERM_GUARDS_DELETE": ("guards", "delete"),
    "PERM_SITES_READ": ("sites", "view"),
    "PERM_SITES_WRITE": ("sites", "edit"),
    "PERM_SITES_DELETE": ("sites", "delete"),
    "PERM_CLIENTS_READ": ("clients", "view"),
    "PERM_CLIENTS_WRITE": ("clients", "edit"),
    "PERM_CLIENTS_DELETE": ("clients", "delete"),
    "PERM_SUBS_READ": ("contractors", "view"),
    "PERM_SUBS_WRITE": ("contractors", "edit"),
    "PERM_SUBS_DELETE": ("contractors", "delete"),
    "PERM_ASSIGN_READ": ("assignments", "view"),
    "PERM_ASSIGN_WRITE": ("assignments", "edit"),
    "PERM_ASSIGN_DELETE": ("assignments", "delete"),
    "PERM_ATTEND_READ": ("attendance", "view"),
    "PERM_ATTEND_WRITE": ("attendance", "edit"),
    "PERM_PAYROLL_READ": ("payroll", "view"),
    "PERM_PAYROLL_WRITE": ("payroll", "edit"),
    "PERM_INV_READ": ("invoices", "view"),
    "PERM_INV_WRITE": ("invoices", "edit"),
    "PERM_INV_DELETE": ("invoices", "delete"),
    "PERM_PAY_READ": ("payments", "view"),
    "PERM_PAY_WRITE": ("payments", "edit"),
    "PERM_PAY_DELETE": ("payments", "delete"),
    "PERM_ALLOW_READ": ("allowances", "view"),
    "PERM_ALLOW_WRITE": ("allowances", "edit"),
    "PERM_ALLOW_DELETE": ("allowances", "delete"),
    "PERM_RATES_READ": ("company", "view"),
    "PERM_RATES_WRITE": ("company", "edit"),
    "PERM_RATES_DELETE": ("company", "delete"),
    "PERM_DOC_READ": ("documents", "view"),
    "PERM_DOC_WRITE": ("documents", "edit"),
    "PERM_DOC_DELETE": ("documents", "delete"),
    "PERM_REP_READ": ("reports", "view"),
    "PERM_EMAIL_SEND": ("email_settings", "edit"),
    "PERM_SUB_READ": ("billing", "view"),
    "PERM_SUB_MANAGE": ("billing", "edit"),
    "PERM_ROLES_READ": ("roles", "view"),
    "PERM_ROLES_WRITE": ("roles", "edit"),
    "PERM_ROLES_DELETE": ("roles", "delete"),
    "PERM_CONTRACTOR_VIEW": ("contractors", "view"),
    "PERM_CONTRACTOR_MANAGE": ("contractors", "edit"),
    "PERM_CONTRACTOR_ASSIGN": ("contractors", "edit"),
    "PERM_STAFF_REQ_READ": ("staff_requests", "view"),
    "PERM_STAFF_REQ_WRITE": ("client_portal", "create"),
    "PERM_STAFF_REQ_REVIEW": ("staff_requests", "edit"),
    "PERM_EXP_READ": ("expenses", "view"),
    "PERM_EXP_WRITE": ("expenses", "edit"),
    "PERM_EXP_DELETE": ("expenses", "delete"),
    "PERM_LEADS_READ": ("leads", "view"),
    "PERM_LEADS_WRITE": ("leads", "edit"),
    "PERM_LEADS_DELETE": ("leads", "delete"),
    "PERM_LEADS_ASSIGN": ("leads", "edit"),
    "PERM_LEADS_EXPORT": ("leads", "view"),
    "PERM_LEADS_REPORTS": ("leads", "view"),
    "PERM_PORTAL_SITES": ("my_portal", "view"),
    "PERM_PORTAL_ROTA_CURRENT": ("my_portal", "view"),
    "PERM_PORTAL_ROTA_UPCOMING": ("my_portal", "create"),
    "PERM_PORTAL_ROTA_PREVIOUS": ("my_portal", "edit"),
    "PERM_PORTAL_HOURS": ("my_portal", "view"),
    "PERM_PATROL_READ": ("patrol", "view"),
    "PERM_PATROL_WRITE": ("patrol", "edit"),
    "PERM_PATROL_SCAN": ("patrol", "edit"),
    "PERM_PATROL_REPORTS": ("patrol", "view"),
    "PERM_INCIDENT_READ": ("incidents", "view"),
    "PERM_INCIDENT_WRITE": ("incidents", "edit"),
    "PERM_INCIDENT_REPORTS": ("incidents", "view"),
    "PERM_ROTA_VIEW": ("rota", "view"),
    "PERM_ROTA_CREATE": ("rota", "create"),
    "PERM_ROTA_EDIT": ("rota", "edit"),
    "PERM_ROTA_DELETE": ("rota", "delete"),
}

# POST create endpoints: WRITE -> create
CREATE_OVERRIDES: dict[str, set[str]] = {
    "clients.py": {"create_client", "renew_client_contract"},
    "guards.py": {"create_guard"},
    "sites.py": {"create_site"},
    "assignments.py": {"create_assignment"},
    "rota_plans.py": {"create_rota_plan", "create_rota"},
    "incidents.py": {"create_incident", "portal_create_incident"},
    "patrol.py": set(),
    "staff_requests.py": set(),
    "leads.py": set(),
    "users.py": set(),
    "documents.py": set(),
    "expenses.py": set(),
    "invoices.py": set(),
    "payments.py": set(),
    "allowances.py": set(),
    "contractors.py": set(),
    "sub_contractors.py": set(),
    "main_contractors.py": set(),
    "rates.py": set(),
    "special_days.py": set(),
    "portal.py": {"portal_create_incident"},
}


def migrate_file(path: Path) -> bool:
    text = path.read_text()
    if "require_perm" not in text and "PERM_" not in text:
        return False

    # Replace require_perm(PERM_X) with require_module(...)
    for perm, (mod, action) in PERM_MAP.items():
        text = text.replace(f"require_perm({perm})", f"require_module(\"{mod}\", \"{action}\")")

    # Fix POST handlers that used WRITE -> should be create
    fname = path.name
    overrides = CREATE_OVERRIDES.get(fname, set())
    if overrides:
        for fn in overrides:
            # require_module("x", "edit") in create function -> create
            pat = rf"(def {fn}\([^)]*\)[^{{]*?)require_module\(\"([^\"]+)\", \"edit\"\)"
            text = re.sub(pat, r"\1require_module(\"\2\", \"create\")", text, flags=re.DOTALL)

    # Clean imports: remove PERM imports, ensure require_module
    lines = text.splitlines()
    new_lines: list[str] = []
    perm_import_started = False
    perm_names: set[str] = set()
    has_require_module = False
    has_require_perm = False

    for line in lines:
        if "from app.rbac import" in line and not line.strip().endswith("("):
            # single line import
            if "require_module" in line:
                has_require_module = True
            if "require_perm" in line:
                has_require_perm = True
            perms = re.findall(r"PERM_\w+", line)
            perm_names.update(perms)
            if perms or "require_perm" in line:
                new_lines.append("from app.rbac import require_module")
                has_require_module = True
            else:
                new_lines.append(line)
            continue

        if line.strip() == "from app.rbac import (":
            perm_import_started = True
            continue

        if perm_import_started:
            if line.strip() == ")":
                perm_import_started = False
                if not has_require_module:
                    new_lines.append("from app.rbac import require_module")
                    has_require_module = True
                continue
            if "require_module" in line:
                has_require_module = True
            if "require_perm" in line:
                has_require_perm = True
            perms = re.findall(r"PERM_\w+", line)
            perm_names.update(perms)
            continue

        new_lines.append(line)

    text = "\n".join(new_lines)
    if "require_module" not in text:
        return False

    path.write_text(text + ("\n" if not text.endswith("\n") else ""))
    return True


def main() -> None:
    changed = []
    for p in sorted(ROUTERS.glob("*.py")):
        if p.name in {"guards.py", "sites.py", "roles.py", "modules.py"}:
            continue
        if migrate_file(p):
            changed.append(p.name)
    print("Migrated:", ", ".join(changed) or "none")


if __name__ == "__main__":
    main()
