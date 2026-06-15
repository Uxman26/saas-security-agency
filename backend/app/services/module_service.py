import json

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


def path_allowed_by_modules(company, path: str) -> bool:
    mod = PATH_MODULE_MAP.get(path)
    if not mod:
        return True
    return is_module_enabled(company, mod)
