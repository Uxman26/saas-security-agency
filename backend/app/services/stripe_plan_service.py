from __future__ import annotations

import logging

import stripe
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import StripePlanPrice
from app.plan_config import VALID_TIERS, normalize_tier
from app.services import platform_plans_service, platform_settings_service

logger = logging.getLogger(__name__)


def _configure() -> None:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    stripe.api_key = settings.stripe_secret_key


def _yearly_amount(monthly_gbp: float) -> int:
    return int(round(monthly_gbp * 12 * 100))


def get_price_row(db: Session, tier: str, billing_cycle: str) -> StripePlanPrice | None:
    t = normalize_tier(tier)
    cycle = "yearly" if billing_cycle == "yearly" else "monthly"
    return (
        db.query(StripePlanPrice)
        .filter(StripePlanPrice.tier == t, StripePlanPrice.billing_cycle == cycle)
        .first()
    )


def ensure_yearly_coupon(db: Session) -> str:
    _configure()
    billing = platform_settings_service.get_billing_settings(db)
    percent = billing["yearly_discount_percent"]
    existing_id = billing.get("yearly_discount_coupon_id") or settings.stripe_yearly_discount_coupon_id
    if existing_id:
        try:
            c = stripe.Coupon.retrieve(existing_id)
            if not c.get("deleted") and float(c.get("percent_off") or 0) == float(percent):
                return existing_id
        except stripe.error.InvalidRequestError:
            pass
    coupon = stripe.Coupon.create(
        percent_off=percent,
        duration="forever",
        name=f"Yearly {percent:.0f}% off",
    )
    platform_settings_service.set_setting(db, "yearly_discount_coupon_id", coupon.id)
    return coupon.id


def sync_all_plans(db: Session) -> list[dict]:
    _configure()
    out = []
    for tier in sorted(VALID_TIERS):
        monthly_gbp = platform_plans_service.get_price(tier)
        out.append(_sync_price(db, tier, "monthly", int(round(monthly_gbp * 100)), None))
        coupon_id = ensure_yearly_coupon(db)
        out.append(_sync_price(db, tier, "yearly", _yearly_amount(monthly_gbp), coupon_id))
    return out


def _sync_price(
    db: Session,
    tier: str,
    billing_cycle: str,
    unit_amount: int,
    coupon_id: str | None,
) -> dict:
    t = normalize_tier(tier)
    row = get_price_row(db, t, billing_cycle)
    product_id = row.stripe_product_id if row else None
    if not product_id:
        product = stripe.Product.create(
            name=f"ControlOps {t.title()}",
            metadata={"tier": t, "billing_cycle": billing_cycle},
        )
        product_id = product.id
    interval = "year" if billing_cycle == "yearly" else "month"
    price = stripe.Price.create(
        product=product_id,
        unit_amount=unit_amount,
        currency="gbp",
        recurring={"interval": interval},
        metadata={"tier": t, "billing_cycle": billing_cycle},
    )
    if row:
        row.stripe_product_id = product_id
        row.stripe_price_id = price.id
        row.unit_amount = unit_amount
    else:
        row = StripePlanPrice(
            tier=t,
            billing_cycle=billing_cycle,
            stripe_product_id=product_id,
            stripe_price_id=price.id,
            unit_amount=unit_amount,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    result = {
        "tier": t,
        "billing_cycle": billing_cycle,
        "stripe_price_id": price.id,
        "unit_amount": unit_amount,
    }
    if coupon_id and billing_cycle == "yearly":
        result["coupon_id"] = coupon_id
    return result


def resolve_price_id(db: Session, tier: str, billing_cycle: str) -> str:
    row = get_price_row(db, tier, billing_cycle)
    if row and row.stripe_price_id:
        return row.stripe_price_id
    sync_all_plans(db)
    row = get_price_row(db, tier, billing_cycle)
    if not row or not row.stripe_price_id:
        raise HTTPException(status_code=500, detail="Stripe price not available")
    return row.stripe_price_id


def create_admin_coupon(
    db: Session,
    percent_off: float | None = None,
    amount_off: int | None = None,
    duration: str = "once",
    max_redemptions: int | None = None,
) -> dict:
    _configure()
    params: dict = {"duration": duration}
    if percent_off is not None:
        params["percent_off"] = percent_off
    elif amount_off is not None:
        params["amount_off"] = amount_off
        params["currency"] = "gbp"
    else:
        raise HTTPException(status_code=400, detail="percent_off or amount_off required")
    if max_redemptions:
        params["max_redemptions"] = max_redemptions
    coupon = stripe.Coupon.create(**params)
    return {"id": coupon.id, "percent_off": coupon.percent_off, "amount_off": coupon.amount_off, "duration": coupon.duration}
