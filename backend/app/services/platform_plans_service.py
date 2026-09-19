import json
import os
from typing import Any

from fastapi import HTTPException

from app.feature_catalog import CATALOG_KEYS, catalog_entries
from app.plan_config import LIMITS, PLAN_PRICES_GBP, VALID_TIERS, normalize_tier

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
    slug = "".join(c if c.isalnum() else "_" for c in (key or "").strip().lower()).strip("_")
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


def get_trial_days(tier: str) -> int:
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
    return 30


def list_tiers() -> list[dict[str, Any]]:
    out = []
    for tier in VALID_TIERS:
        lim = get_limits(tier)
        out.append(
            {
                "tier": tier,
                "price_gbp": get_price(tier),
                "max_guards": lim.get("max_guards"),
                "max_sites": lim.get("max_sites"),
                "max_users": lim.get("max_users"),
                "features": lim.get("features") or {},
                "trial_days": get_trial_days(tier),
            }
        )
    from app.plan_config import tier_rank

    out.sort(key=lambda x: tier_rank(x["tier"]))
    return out


def update_tier(tier: str, payload: dict[str, Any]) -> dict[str, Any]:
    t = normalize_tier(tier)
    if t not in VALID_TIERS:
        raise HTTPException(status_code=400, detail="Invalid tier")
    raw = _read_raw()
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
    lim = get_limits(t)
    return {
        "tier": t,
        "price_gbp": get_price(t),
        "max_guards": lim.get("max_guards"),
        "max_sites": lim.get("max_sites"),
        "max_users": lim.get("max_users"),
        "features": lim.get("features") or {},
        "trial_days": get_trial_days(t),
    }
