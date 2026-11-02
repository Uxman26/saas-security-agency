import json
import os
from typing import Any

from fastapi import HTTPException

from app.feature_catalog import CATALOG_KEYS, catalog_entries
from app.plan_config import DEFAULT_TRIAL_DAYS, LIMITS, PLAN_PRICES_GBP, TIER_ORDER, VALID_TIERS, normalize_tier

# Must resolve to the persistent volume (/app/data), the same place
# platform_smtp_service writes. Deriving it from __file__ pointed at /app/app/data —
# inside the image's writable layer — so every saved plan edit was lost on rebuild.
_DATA_DIR = os.environ.get("APP_DATA_DIR") or os.path.join(os.getcwd(), "data")
_PLANS_FILE = os.path.join(_DATA_DIR, "platform_plans.json")


def _read_raw() -> dict:
    if not os.path.isfile(_PLANS_FILE):
        return {}
    try:
        with open(_PLANS_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _write_raw(data: dict) -> None:
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(_PLANS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


MAX_TIERS = 4


def _slug(value: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in (value or "").strip().lower()).strip("_")


def active_tiers() -> list[str]:
    """Packages that exist right now: the built-ins a super admin has not deleted plus
    any they created, cheapest first so rank (upgrade vs downgrade) follows price."""
    raw = _read_raw()
    removed = set(raw.get("removed_tiers") or [])
    custom = raw.get("custom_tiers") or {}
    keys = [t for t in VALID_TIERS if t not in removed] + [k for k in custom if k not in VALID_TIERS]
    prices = raw.get("prices") or {}

    def price(t: str) -> float:
        return float(prices.get(t, PLAN_PRICES_GBP.get(t, 0.0)))

    return sorted(keys, key=lambda t: (price(t), TIER_ORDER.get(t, 99), t))


def get_display(tier: str) -> dict[str, Any]:
    """Name/description a super admin set. None for built-ins left alone, so the
    translated copy on the public pricing page still applies."""
    raw = _read_raw()
    meta = (raw.get("display") or {}).get(tier) or {}
    custom = (raw.get("custom_tiers") or {}).get(tier)
    name = meta.get("name") or (custom or {}).get("name")
    description = meta.get("description")
    if description is None and custom is not None:
        description = custom.get("description") or ""
    return {"name": name, "description": description}


def get_price(tier: str) -> float:
    t = normalize_tier(tier)
    raw = _read_raw()
    prices = raw.get("prices") or {}
    if t in prices:
        return float(prices[t])
    return float(PLAN_PRICES_GBP.get(t, PLAN_PRICES_GBP["basic"]))


def _feature_keys(raw: dict) -> list[str]:
    custom = raw.get("custom_features") or {}
    return list(CATALOG_KEYS) + [k for k in custom if k not in CATALOG_KEYS]


def _normalize_features(features: dict[str, Any], raw: dict) -> dict[str, bool]:
    """Every known feature gets an explicit true/false.

    A package that simply omits a key used to render as a blank cell, which reads as
    "unknown" rather than "not included" — the whole complaint about packages not
    saying what they contain. Unknown keys still in a saved plan are kept so an
    experiment is never silently dropped.
    """
    out = {k: bool(features.get(k, False)) for k in _feature_keys(raw)}
    for k, v in features.items():
        if k not in out:
            out[k] = bool(v)
    return out


def get_limits(tier: str) -> dict[str, Any]:
    t = normalize_tier(tier)
    raw = _read_raw()
    limits = raw.get("limits") or {}
    base = dict(LIMITS.get(t, LIMITS["basic"]))
    merged = base
    if t in limits and isinstance(limits[t], dict):
        merged = {**base, **limits[t]}
        if "features" in limits[t]:
            merged["features"] = {**base.get("features", {}), **limits[t]["features"]}
    merged = dict(merged)
    merged["features"] = _normalize_features(merged.get("features") or {}, raw)
    return merged


def list_features() -> list[dict[str, Any]]:
    raw = _read_raw()
    custom = raw.get("custom_features") or {}
    entries = catalog_entries()
    for key, meta in custom.items():
        if key in CATALOG_KEYS:
            continue
        meta = meta if isinstance(meta, dict) else {}
        entries.append(
            {
                "key": key,
                "label": meta.get("label") or key.replace("_", " ").capitalize(),
                "description": meta.get("description") or "",
                "group": meta.get("group") or "apps",
                "tenant_module": meta.get("tenant_module"),
                "custom": True,
            }
        )
    return entries


def add_custom_feature(key: str, label: str, description: str = "", group: str = "apps") -> dict[str, Any]:
    slug = _slug(key)
    if not slug:
        raise HTTPException(status_code=400, detail="Feature key is required")
    if slug in CATALOG_KEYS:
        raise HTTPException(status_code=400, detail="Feature already exists")
    raw = _read_raw()
    custom = dict(raw.get("custom_features") or {})
    custom[slug] = {"label": label or slug.replace("_", " ").capitalize(), "description": description, "group": group}
    raw["custom_features"] = custom
    _write_raw(raw)
    return {"key": slug, **custom[slug], "tenant_module": None, "custom": True}


def delete_custom_feature(key: str) -> None:
    raw = _read_raw()
    custom = dict(raw.get("custom_features") or {})
    if key not in custom:
        raise HTTPException(status_code=404, detail="Feature not found")
    custom.pop(key)
    raw["custom_features"] = custom
    limits = dict(raw.get("limits") or {})
    for tier, entry in limits.items():
        feats = dict((entry or {}).get("features") or {})
        if key in feats:
            feats.pop(key)
            limits[tier] = {**entry, "features": feats}
    raw["limits"] = limits
    _write_raw(raw)


def get_trial_days_override(tier: str) -> int | None:
    """The per-package trial length a super admin set, or None if they left it unset.

    Kept separate from `get_trial_days` so callers with a session can fall back to the
    platform-wide default (Trials -> Default days) rather than the hard-coded constant.
    """
    t = normalize_tier(tier)
    raw = _read_raw()
    days_map = raw.get("trial_days") or {}
    if t in days_map:
        try:
            days = int(days_map[t])
            if 1 <= days <= 365:
                return days
        except (TypeError, ValueError):
            pass
    return None


def get_trial_days(tier: str) -> int:
    return get_trial_days_override(tier) or DEFAULT_TRIAL_DAYS


def _tier_out(tier: str, default_trial_days: int | None) -> dict[str, Any]:
    lim = get_limits(tier)
    return {
        "tier": tier,
        **get_display(tier),
        "price_gbp": get_price(tier),
        "max_guards": lim.get("max_guards"),
        "max_sites": lim.get("max_sites"),
        "max_users": lim.get("max_users"),
        "features": lim.get("features") or {},
        "trial_days": get_trial_days_override(tier) or default_trial_days or DEFAULT_TRIAL_DAYS,
        "custom": tier not in VALID_TIERS,
    }


def list_tiers(default_trial_days: int | None = None) -> list[dict[str, Any]]:
    """`default_trial_days` is the platform-wide Trials -> Default days, which callers
    with a session pass so a package without its own override reports the value that
    would actually be granted."""
    return [_tier_out(t, default_trial_days) for t in active_tiers()]


def update_tier(tier: str, payload: dict[str, Any], default_trial_days: int | None = None) -> dict[str, Any]:
    # Not normalize_tier: that maps unknown keys to basic, so a typo would edit Basic.
    t = (tier or "").strip().lower()
    if t not in active_tiers():
        raise HTTPException(status_code=404, detail="Package not found")
    raw = _read_raw()
    display = dict(raw.get("display") or {})
    meta = dict(display.get(t) or {})
    for key in ("name", "description"):
        if key in payload and payload[key] is not None:
            meta[key] = str(payload[key]).strip()
    if meta:
        display[t] = meta
        raw["display"] = display
    prices = dict(raw.get("prices") or {})
    limits = dict(raw.get("limits") or {})
    if payload.get("price_gbp") is not None:
        prices[t] = float(payload["price_gbp"])
    entry = dict(limits.get(t) or LIMITS.get(t, LIMITS["basic"]))
    # `in payload`, not `is not None`: the router passes exclude_unset, so an explicit
    # null is the caller saying "unlimited". Treating it as absent left the old cap in
    # place and made clearing a limit impossible.
    for key in ("max_guards", "max_sites", "max_users"):
        if key in payload:
            entry[key] = payload[key]
    if payload.get("features") is not None:
        entry["features"] = {**entry.get("features", {}), **payload["features"]}
    for key in payload.get("remove_features") or []:
        entry.get("features", {}).pop(key, None)
    limits[t] = entry
    if payload.get("trial_days") is not None:
        days = int(payload["trial_days"])
        if days < 1 or days > 365:
            raise HTTPException(status_code=400, detail="Trial days must be between 1 and 365")
        trial_days = dict(raw.get("trial_days") or {})
        trial_days[t] = days
        raw["trial_days"] = trial_days
    raw["prices"] = prices
    raw["limits"] = limits
    _write_raw(raw)
    return _tier_out(t, default_trial_days)


def create_tier(payload: dict[str, Any], default_trial_days: int | None = None) -> dict[str, Any]:
    slug = _slug(payload.get("tier") or payload.get("name") or "")
    if not slug:
        raise HTTPException(status_code=400, detail="Package key is required")
    if len(slug) > 32:
        raise HTTPException(status_code=400, detail="Package key must be 32 characters or fewer")
    active = active_tiers()
    if slug in active:
        raise HTTPException(status_code=400, detail="A package with that key already exists")
    if len(active) >= MAX_TIERS:
        raise HTTPException(status_code=400, detail=f"You can have at most {MAX_TIERS} packages. Delete one first.")
    raw = _read_raw()
    if slug in VALID_TIERS:
        # Re-creating a deleted built-in brings it back instead of shadowing it.
        raw["removed_tiers"] = [t for t in raw.get("removed_tiers") or [] if t != slug]
    else:
        custom = dict(raw.get("custom_tiers") or {})
        custom[slug] = {
            "name": (payload.get("name") or slug.replace("_", " ").title()).strip(),
            "description": (payload.get("description") or "").strip(),
        }
        raw["custom_tiers"] = custom
        limits = dict(raw.get("limits") or {})
        limits[slug] = {
            "max_guards": None,
            "max_sites": None,
            "max_users": None,
            "features": {k: False for k in _feature_keys(raw)},
        }
        raw["limits"] = limits
        prices = dict(raw.get("prices") or {})
        prices[slug] = 0.0
        raw["prices"] = prices
    _write_raw(raw)
    rest = {k: v for k, v in payload.items() if k != "tier"}
    rest.setdefault("features", {})
    return update_tier(slug, rest, default_trial_days)


def delete_tier(tier: str, companies_on_tier: int) -> None:
    t = (tier or "").strip().lower()
    active = active_tiers()
    if t not in active:
        raise HTTPException(status_code=404, detail="Package not found")
    if len(active) <= 1:
        raise HTTPException(status_code=400, detail="At least one package must remain")
    if companies_on_tier:
        raise HTTPException(
            status_code=400,
            detail=f"{companies_on_tier} compan{'y is' if companies_on_tier == 1 else 'ies are'} on this package. Move them to another package first.",
        )
    raw = _read_raw()
    if t in VALID_TIERS:
        raw["removed_tiers"] = sorted(set(raw.get("removed_tiers") or []) | {t})
    else:
        custom = dict(raw.get("custom_tiers") or {})
        custom.pop(t, None)
        raw["custom_tiers"] = custom
    # Drop saved settings so a re-created package starts from its defaults.
    for section in ("prices", "limits", "trial_days", "display"):
        data = dict(raw.get(section) or {})
        data.pop(t, None)
        raw[section] = data
    _write_raw(raw)
