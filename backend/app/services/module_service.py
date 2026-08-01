"""Database-driven app modules and role × module permission matrix.

Two distinct concerns live here:

* ``AppModule`` / ``RoleModulePermission`` — the RBAC registry that decides which
  screens and actions a role may use.
* ``TENANT_MODULES`` plan flags — paid-feature toggles (WhatsApp, email…) derived
  from the company's subscription tier. These are orthogonal to RBAC: RBAC says
  "may this role use Email settings", the plan flag says "does this company's
  plan include email at all".
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AppModule, Role, RoleModulePermission
from app.rbac_matrix import matrix_to_codes, wrap_matrix

# Seed: key, name, icon (lucide), sidebar_path, order, section_key
#
# A module with an empty sidebar_path is permission-only: it grants a capability inside
# another screen instead of being a page, so it is never shown in the sidebar and never
# takes part in URL guarding.
MODULE_SEED: tuple[tuple[str, str, str, str, int, str], ...] = (
    ("dashboard", "Dashboard", "LayoutDashboard", "/dashboard", 1, "sectionOverview"),
    ("guards", "Staff", "Users", "/guards", 10, "sectionHr"),
    ("documents", "Documents", "FolderOpen", "/documents", 11, "sectionHr"),
    ("contractors", "Contractors", "UserCog", "/contractors", 12, "sectionHr"),
    ("sub_contractors", "Sub-contractors", "UserCog", "/sub-contractors", 125, "sectionHr"),
    ("attendance", "Attendance", "Clock", "/attendance", 13, "sectionHr"),
    ("roles", "Roles & Permissions", "Shield", "/settings/roles", 14, "sectionHr"),
    ("my_portal", "My portal", "UserCircle", "/my-portal", 20, "sectionOperations"),
    ("sites", "Sites", "MapPin", "/sites", 21, "sectionOperations"),
    ("assignments", "Assignments", "ClipboardList", "/assignments", 22, "sectionOperations"),
    ("rota", "Rotas & Shifts", "Calendar", "/rota", 23, "sectionOperations"),
    ("rota_payable", "Rota — Payable amounts", "PoundSterling", "", 231, "sectionOperations"),
    ("patrol", "Patrol", "MapPinned", "/patrol", 24, "sectionOperations"),
    ("incidents", "Incidents", "AlertTriangle", "/incidents", 25, "sectionOperations"),
    ("client_portal", "Client portal", "Building2", "/client-portal", 26, "sectionOperations"),
    ("staff_requests", "Staff requests", "ClipboardList", "/requests", 27, "sectionOperations"),
    ("clients", "Clients", "Building2", "/clients", 30, "sectionSales"),
    ("leads", "Leads", "Target", "/leads", 31, "sectionSales"),
    ("payroll", "Payroll", "PoundSterling", "/payroll", 40, "sectionFinance"),
    ("invoices", "Invoices", "FileText", "/invoices", 41, "sectionFinance"),
    ("payments", "Payments", "CreditCard", "/payments", 42, "sectionFinance"),
    ("expenses", "Expenses", "Receipt", "/expenses", 43, "sectionFinance"),
    ("allowances", "Allowances", "Gift", "/allowances", 44, "sectionFinance"),
    ("reports", "Reports", "ClipboardList", "/reports", 50, "sectionReports"),
    ("company", "Company", "Building2", "/settings/company", 60, "sectionSettings"),
    ("billing", "Billing", "CreditCard", "/settings/billing", 61, "sectionSettings"),
    ("special_days", "Special days", "Calendar", "/settings/special-days", 62, "sectionSettings"),
    ("sms", "SMS", "MessageSquare", "/settings/sms", 63, "sectionSettings"),
    ("email_settings", "Email", "Mail", "/settings/email", 64, "sectionSettings"),
)

ACTIONS = ("view", "create", "edit", "delete")

# --- Subscription plan feature flags -------------------------------------------------
# Stored per company in Company.enabled_modules_json. Unknown/absent keys default to
# enabled so an older row never silently loses a feature.

TENANT_MODULES = ("expenses", "whatsapp", "email", "mobile_apps")

DEFAULT_MODULES = {m: True for m in TENANT_MODULES}

PATH_MODULE_MAP = {
    "/expenses": "expenses",
}


def parse_modules(raw: str | None) -> dict[str, bool]:
    if not raw:
        return dict(DEFAULT_MODULES)
    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return dict(DEFAULT_MODULES)
    if not isinstance(d, dict):
        return dict(DEFAULT_MODULES)
    out = dict(DEFAULT_MODULES)
    for k in TENANT_MODULES:
        if k in d:
            out[k] = bool(d[k])
    return out


def dump_modules(modules: dict[str, bool] | None) -> str:
    base = dict(DEFAULT_MODULES)
    if modules:
        for k in TENANT_MODULES:
            if k in modules:
                base[k] = bool(modules[k])
    return json.dumps(base)


def is_module_enabled(company, module: str) -> bool:
    mods = parse_modules(getattr(company, "enabled_modules_json", None))
    return mods.get(module, True)


def modules_from_plan(tier: str) -> dict[str, bool]:
    from app.plan_config import limits_for_tier

    feats = limits_for_tier(tier).get("features", {})
    return {
        "whatsapp": bool(feats.get("sms", False)),
        "email": bool(feats.get("email", True)),
    }


def apply_plan_module_flags(company, tier: str) -> None:
    from app.plan_config import normalize_tier

    plan_mods = modules_from_plan(normalize_tier(tier))
    mods = parse_modules(getattr(company, "enabled_modules_json", None))
    mods["whatsapp"] = plan_mods["whatsapp"]
    mods["email"] = plan_mods["email"]
    company.enabled_modules_json = dump_modules(mods)


def path_allowed_by_modules(company, path: str) -> bool:
    mod = PATH_MODULE_MAP.get(path)
    if not mod:
        return True
    return is_module_enabled(company, mod)


# --- RBAC module registry ------------------------------------------------------------


def module_action_code(module_key: str, action: str) -> str:
    return f"{module_key}.{action}"


def ensure_app_modules(db: Session) -> None:
    for key, name, icon, path, order, section in MODULE_SEED:
        row = db.query(AppModule).filter(AppModule.key == key).first()
        if row:
            row.name = name
            row.icon = icon
            row.sidebar_path = path
            row.sidebar_order = order
            row.section_key = section
            row.is_active = True
        else:
            db.add(
                AppModule(
                    key=key,
                    name=name,
                    icon=icon,
                    sidebar_path=path,
                    sidebar_order=order,
                    section_key=section,
                    is_active=True,
                )
            )
    db.flush()


def list_active_modules(db: Session) -> list[AppModule]:
    return (
        db.query(AppModule)
        .filter(AppModule.is_active.is_(True))
        .order_by(AppModule.sidebar_order, AppModule.name)
        .all()
    )


def list_all_modules(db: Session) -> list[AppModule]:
    return db.query(AppModule).order_by(AppModule.sidebar_order, AppModule.name).all()


def empty_matrix_for_modules(modules: list[AppModule]) -> dict[str, Any]:
    row = {a: False for a in ACTIONS}
    return {m.key: dict(row) for m in modules}


def matrix_from_role_permissions(db: Session, role: Role) -> dict[str, Any]:
    modules = list_active_modules(db)
    matrix = empty_matrix_for_modules(modules)
    if not role.id:
        return matrix
    rows = (
        db.query(RoleModulePermission)
        .join(AppModule)
        .filter(RoleModulePermission.role_id == role.id, AppModule.is_active.is_(True))
        .all()
    )
    if not rows:
        from app.services.role_service import matrix_from_permissions_json

        legacy = matrix_from_permissions_json(role.permissions_json)
        for m in modules:
            if m.key in legacy:
                matrix[m.key] = {
                    "view": bool(legacy[m.key].get("view")),
                    "create": bool(legacy[m.key].get("create")),
                    "edit": bool(legacy[m.key].get("edit")),
                    "delete": bool(legacy[m.key].get("delete")),
                }
        return matrix
    for rmp in rows:
        k = rmp.module.key
        if k in matrix:
            matrix[k] = {
                "view": bool(rmp.can_view),
                "create": bool(rmp.can_create),
                "edit": bool(rmp.can_edit),
                "delete": bool(rmp.can_delete),
            }
    return matrix


def sync_role_permissions_from_matrix(db: Session, role: Role, matrix: dict[str, Any]) -> None:
    modules = list_active_modules(db)
    module_by_key = {m.key: m for m in modules}
    existing = {
        rmp.module_id: rmp
        for rmp in db.query(RoleModulePermission).filter(RoleModulePermission.role_id == role.id).all()
    }
    for m in modules:
        cell = matrix.get(m.key) or {}
        rmp = existing.get(m.id)
        if not rmp:
            rmp = RoleModulePermission(role_id=role.id, module_id=m.id)
            db.add(rmp)
        rmp.can_view = bool(cell.get("view"))
        rmp.can_create = bool(cell.get("create"))
        rmp.can_edit = bool(cell.get("edit"))
        rmp.can_delete = bool(cell.get("delete"))
    # Keep JSON matrix for legacy code expansion
    filtered = {k: matrix[k] for k in module_by_key if k in matrix}
    role.permissions_json = wrap_matrix(filtered)
    db.flush()


def module_permission_codes_for_role(db: Session, role_id: int) -> frozenset[str]:
    codes: set[str] = set()
    rows = (
        db.query(RoleModulePermission)
        .join(AppModule)
        .filter(RoleModulePermission.role_id == role_id, AppModule.is_active.is_(True))
        .all()
    )
    for rmp in rows:
        codes.update(_expand_app_permission_codes(rmp.module.key, rmp))
    return frozenset(codes)


def _expand_app_permission_codes(app_key: str, rmp: RoleModulePermission) -> set[str]:
    """Module action codes + legacy API permission codes."""
    from app.module_perms import legacy_codes_for_module_action

    v, c, e, d = bool(rmp.can_view), bool(rmp.can_create), bool(rmp.can_edit), bool(rmp.can_delete)
    codes: set[str] = set()
    if v:
        codes.add(module_action_code(app_key, "view"))
        codes.update(legacy_codes_for_module_action(app_key, "view"))
    if c:
        codes.add(module_action_code(app_key, "create"))
        codes.update(legacy_codes_for_module_action(app_key, "create"))
    if e:
        codes.add(module_action_code(app_key, "edit"))
        codes.update(legacy_codes_for_module_action(app_key, "edit"))
    if d:
        codes.add(module_action_code(app_key, "delete"))
        codes.update(legacy_codes_for_module_action(app_key, "delete"))
    return codes


def all_module_action_codes(db: Session) -> frozenset[str]:
    modules = list_active_modules(db)
    codes: set[str] = set()
    for m in modules:
        for a in ACTIONS:
            codes.add(module_action_code(m.key, a))
    return frozenset(codes)


def module_access_for_role(db: Session, role_id: int | None, bypass: bool) -> list[dict[str, Any]]:
    modules = list_active_modules(db)
    if bypass:
        return [
            {
                "key": m.key,
                "name": m.name,
                "icon": m.icon,
                "sidebar_path": m.sidebar_path,
                "sidebar_order": m.sidebar_order,
                "section_key": m.section_key,
                "can_view": True,
                "can_create": True,
                "can_edit": True,
                "can_delete": True,
            }
            for m in modules
        ]
    perms_by_module: dict[int, RoleModulePermission] = {}
    if role_id:
        for rmp in (
            db.query(RoleModulePermission)
            .filter(RoleModulePermission.role_id == role_id)
            .all()
        ):
            perms_by_module[rmp.module_id] = rmp
    out: list[dict[str, Any]] = []
    for m in modules:
        rmp = perms_by_module.get(m.id)
        out.append(
            {
                "key": m.key,
                "name": m.name,
                "icon": m.icon,
                "sidebar_path": m.sidebar_path,
                "sidebar_order": m.sidebar_order,
                "section_key": m.section_key,
                "can_view": bool(rmp and rmp.can_view),
                "can_create": bool(rmp and rmp.can_create),
                "can_edit": bool(rmp and rmp.can_edit),
                "can_delete": bool(rmp and rmp.can_delete),
            }
        )
    return out


def expand_coarse_matrix_to_app_modules(coarse: dict[str, Any], modules: list[AppModule]) -> dict[str, Any]:
    """Map legacy rbac_matrix module keys onto fine-grained app_modules rows."""
    full = empty_matrix_for_modules(modules)
    keys = {m.key: m for m in modules}

    def set_cell(app_key: str, cell: dict[str, Any]) -> None:
        if app_key in full:
            full[app_key] = {
                "view": bool(cell.get("view")),
                "create": bool(cell.get("create")),
                "edit": bool(cell.get("edit")),
                "delete": bool(cell.get("delete")),
            }

    for mod_key, cell in coarse.items():
        if mod_key in keys:
            set_cell(mod_key, cell)
        elif mod_key == "settings":
            for k in ("roles", "company", "billing", "special_days", "sms", "email_settings", "documents"):
                set_cell(k, cell)
            if cell.get("view"):
                set_cell("attendance", {"view": True, "create": False, "edit": False, "delete": False})
        elif mod_key == "portal":
            set_cell("my_portal", cell)
        elif mod_key == "rota":
            for k in ("rota", "assignments", "attendance"):
                set_cell(k, cell)
        elif mod_key == "invoices":
            for k in ("invoices", "payments", "payroll", "expenses"):
                set_cell(k, cell)
        elif mod_key == "contractors":
            set_cell("contractors", cell)
        elif mod_key == "staff_requests":
            set_cell("staff_requests", cell)
            set_cell("client_portal", {"view": cell.get("view"), "create": cell.get("create"), "edit": False, "delete": False})
        elif mod_key == "contractor_registry" or mod_key == "contractor_links":
            set_cell("contractors", cell)

    return full


def default_admin_app_matrix(modules: list[AppModule]) -> dict[str, Any]:
    row = {a: True for a in ACTIONS}
    return {m.key: dict(row) for m in modules}


def coarse_unmappable_module_keys(modules: list[AppModule]) -> set[str]:
    """Modules the legacy coarse matrix cannot express.

    Derived rather than hard-coded: expand an all-true coarse matrix and see which app
    modules it never reaches. Capability modules such as ``rota_payable`` land here, as do
    fine-grained modules with no legacy counterpart.
    """
    from app.rbac_matrix import MODULE_KEYS

    all_true = {k: {a: True for a in ACTIONS} for k in MODULE_KEYS}
    expanded = expand_coarse_matrix_to_app_modules(all_true, modules)
    return {m.key for m in modules if not any(expanded.get(m.key, {}).values())}


def stored_cells_for_keys(db: Session, role_id: int | None, keys: set[str]) -> dict[str, Any]:
    """Currently saved matrix cells for the given module keys."""
    if not role_id or not keys:
        return {}
    out: dict[str, Any] = {}
    rows = (
        db.query(RoleModulePermission)
        .join(AppModule)
        .filter(RoleModulePermission.role_id == role_id)
        .all()
    )
    for rmp in rows:
        if rmp.module.key in keys:
            out[rmp.module.key] = {
                "view": bool(rmp.can_view),
                "create": bool(rmp.can_create),
                "edit": bool(rmp.can_edit),
                "delete": bool(rmp.can_delete),
            }
    return out


def backfill_role_module_permissions(db: Session) -> None:
    """Populate role_module_permissions from permissions_json for all roles.

    This runs on every startup, and the coarse matrix it rebuilds from cannot represent
    every app module. Grants for those modules are carried over from the rows already
    saved, otherwise anything an admin ticked there would be wiped on the next restart.
    """
    ensure_app_modules(db)
    roles = db.query(Role).all()
    modules = list_active_modules(db)
    preserve_keys = coarse_unmappable_module_keys(modules)
    from app.services.role_service import matrix_from_permissions_json

    for role in roles:
        if role.slug == "admin":
            full = default_admin_app_matrix(modules)
        else:
            coarse = matrix_from_permissions_json(role.permissions_json)
            full = expand_coarse_matrix_to_app_modules(coarse, modules)
            full.update(stored_cells_for_keys(db, role.id, preserve_keys))
        sync_role_permissions_from_matrix(db, role, full)
    db.commit()
