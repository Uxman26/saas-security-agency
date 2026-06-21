import json

TENANT_MODULES = ("expenses", "whatsapp", "email", "mobile_apps", "leads")

DEFAULT_MODULES = {m: True for m in TENANT_MODULES}
DEFAULT_MODULES["leads"] = False

PATH_MODULE_MAP = {
    "/expenses": "expenses",
    "/leads": "leads",
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
