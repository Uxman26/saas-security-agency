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
    return LIMITS[normalize_tier(tier)]


def feature_enabled(tier: Optional[str], key: str) -> bool:
    return bool(limits_for_tier(tier)["features"].get(key))


def quota_guards(tier: Optional[str]) -> Optional[int]:
    n = limits_for_tier(tier)["max_guards"]
    return n


def quota_sites(tier: Optional[str]) -> Optional[int]:
    n = limits_for_tier(tier)["max_sites"]
    return n
