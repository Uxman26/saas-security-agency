import json
import os
from typing import Any

from fastapi import HTTPException

from app.plan_config import LIMITS, PLAN_PRICES_GBP, VALID_TIERS, normalize_tier

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
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


def get_limits(tier: str) -> dict[str, Any]:
    t = normalize_tier(tier)
    raw = _read_raw()
    limits = raw.get("limits") or {}
    base = dict(LIMITS.get(t, LIMITS["basic"]))
    if t in limits and isinstance(limits[t], dict):
        merged = {**base, **limits[t]}
        if "features" in limits[t]:
            merged["features"] = {**base.get("features", {}), **limits[t]["features"]}
        return merged
    return base


def list_tiers() -> list[dict[str, Any]]:
    out = []
    for tier in sorted(VALID_TIERS):
        lim = get_limits(tier)
        out.append(
            {
                "tier": tier,
                "price_gbp": get_price(tier),
                "max_guards": lim.get("max_guards"),
                "max_sites": lim.get("max_sites"),
                "features": lim.get("features") or {},
            }
        )
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
    if payload.get("max_guards") is not None:
        entry["max_guards"] = payload["max_guards"]
    if payload.get("max_sites") is not None:
        entry["max_sites"] = payload["max_sites"]
    if payload.get("features") is not None:
        entry["features"] = {**entry.get("features", {}), **payload["features"]}
    limits[t] = entry
    raw["prices"] = prices
    raw["limits"] = limits
    _write_raw(raw)
    lim = get_limits(t)
    return {
        "tier": t,
        "price_gbp": get_price(t),
        "max_guards": lim.get("max_guards"),
        "max_sites": lim.get("max_sites"),
        "features": lim.get("features") or {},
    }
