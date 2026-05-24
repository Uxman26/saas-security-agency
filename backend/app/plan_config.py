from __future__ import annotations

from typing import Any, Optional

TIER_ALIASES = {"starter": "basic"}
VALID_TIERS = frozenset({"basic", "standard", "premium", "enterprise"})

LIMITS: dict[str, dict[str, Any]] = {
    "basic": {
        "max_guards": 10,
        "max_sites": 5,
        "features": {
            "subcontractors": False,
            "extended_reports": False,
            "contractors": False,
            "sub_contractors": False,
        },
    },
    "standard": {
        "max_guards": 50,
        "max_sites": 25,
        "features": {
            "subcontractors": True,
            "extended_reports": False,
            "contractors": False,
            "sub_contractors": False,
        },
    },
    "premium": {
        "max_guards": None,
        "max_sites": None,
        "features": {
            "subcontractors": True,
            "extended_reports": True,
            "contractors": True,
            "sub_contractors": False,
        },
    },
    "enterprise": {
        "max_guards": None,
        "max_sites": None,
        "features": {
            "subcontractors": True,
            "extended_reports": True,
            "contractors": True,
            "sub_contractors": True,
        },
    },
}


def normalize_tier(tier: Optional[str]) -> str:
    t = (tier or "basic").lower().strip()
    t = TIER_ALIASES.get(t, t)
    return t if t in VALID_TIERS else "basic"


def limits_for_tier(tier: Optional[str]) -> dict[str, Any]:
    # return LIMITS[normalize_tier(tier)]
    return LIMITS["enterprise"]


def feature_enabled(tier: Optional[str], key: str) -> bool:
    # return bool(limits_for_tier(tier)["features"].get(key))
    return True


def quota_guards(tier: Optional[str]) -> Optional[int]:
    # n = limits_for_tier(tier)["max_guards"]
    # return n
    return None


def quota_sites(tier: Optional[str]) -> Optional[int]:
    # n = limits_for_tier(tier)["max_sites"]
    # return n
    return None


PLAN_PRICES_GBP: dict[str, float] = {
    "basic": 29.0,
    "standard": 79.0,
    "premium": 149.0,
    "enterprise": 299.0,
}

SUBSCRIPTION_PERIOD_DAYS = 30


def price_for_tier(tier: Optional[str]) -> float:
    return float(PLAN_PRICES_GBP.get(normalize_tier(tier), PLAN_PRICES_GBP["basic"]))
