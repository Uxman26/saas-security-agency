from __future__ import annotations

from typing import Any, Optional

TIER_ALIASES = {"starter": "basic"}
VALID_TIERS = frozenset({"basic", "standard", "premium", "enterprise"})

LIMITS: dict[str, dict[str, Any]] = {
    "basic": {
        "max_guards": 10,
        "max_sites": 5,
        "max_users": 5,
        "features": {
            "subcontractors": False,
            "extended_reports": False,
            "contractors": False,
            "sub_contractors": False,
            "sms": False,
            "email": True,
        },
    },
    "standard": {
        "max_guards": 50,
        "max_sites": 25,
        "max_users": 15,
        "features": {
            "subcontractors": True,
            "extended_reports": False,
            "contractors": False,
            "sub_contractors": False,
            "sms": True,
            "email": True,
        },
    },
    "premium": {
        "max_guards": None,
        "max_sites": None,
        "max_users": 50,
        "features": {
            "subcontractors": True,
            "extended_reports": True,
            "contractors": True,
            "sub_contractors": False,
            "sms": True,
            "email": True,
        },
    },
    "enterprise": {
        "max_guards": None,
        "max_sites": None,
        "max_users": None,
        "features": {
            "subcontractors": True,
            "extended_reports": True,
            "contractors": True,
            "sub_contractors": True,
            "sms": True,
            "email": True,
        },
    },
}


def normalize_tier(tier: Optional[str]) -> str:
    t = (tier or "basic").lower().strip()
    t = TIER_ALIASES.get(t, t)
    return t if t in VALID_TIERS else "basic"


def limits_for_tier(tier: Optional[str]) -> dict[str, Any]:
    from app.services.platform_plans_service import get_limits
    return get_limits(tier or "basic")


def feature_enabled(tier: Optional[str], key: str) -> bool:
    # return bool(limits_for_tier(tier)["features"].get(key))
    return True


def quota_guards(tier: Optional[str]) -> Optional[int]:
    n = limits_for_tier(tier)["max_guards"]
    return n


def quota_sites(tier: Optional[str]) -> Optional[int]:
    n = limits_for_tier(tier)["max_sites"]
    return n


def quota_users(tier: Optional[str]) -> Optional[int]:
    n = limits_for_tier(tier).get("max_users")
    return n


PLAN_PRICES_GBP: dict[str, float] = {
    "basic": 29.0,
    "standard": 79.0,
    "premium": 149.0,
    "enterprise": 299.0,
}

SUBSCRIPTION_PERIOD_DAYS = 30


def price_for_tier(tier: Optional[str]) -> float:
    from app.services.platform_plans_service import get_price
    return get_price(tier or "basic")


TIER_ORDER = {"basic": 1, "standard": 2, "premium": 3, "enterprise": 4}


def tier_rank(tier: Optional[str]) -> int:
    return TIER_ORDER.get(normalize_tier(tier), 0)


def is_plan_downgrade(company, tier: str, billing_cycle: str) -> bool:
    current_tier = normalize_tier(company.subscription_tier)
    new_tier = normalize_tier(tier)
    if tier_rank(new_tier) < tier_rank(current_tier):
        return True
    current_cycle = company.billing_cycle or "monthly"
    cycle = "yearly" if billing_cycle == "yearly" else "monthly"
    if new_tier == current_tier and current_cycle == "yearly" and cycle == "monthly":
        return True
    return False
