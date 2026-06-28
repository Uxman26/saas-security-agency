from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.models import PlatformSetting

DEFAULTS = {
    "yearly_discount_percent": "20",
    "yearly_discount_coupon_id": "",
    "payment_failed_lock_retries": "3",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_setting(db: Session, key: str, default: str | None = None) -> str:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if row and row.value is not None:
        return str(row.value)
    if default is not None:
        return default
    return DEFAULTS.get(key, "")


def set_setting(db: Session, key: str, value: str) -> PlatformSetting:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if row:
        row.value = value
        row.updated_at = _utcnow()
    else:
        row = PlatformSetting(key=key, value=value)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_billing_settings(db: Session) -> dict[str, Any]:
    coupon_id = get_setting(db, "yearly_discount_coupon_id") or settings.stripe_yearly_discount_coupon_id
    return {
        "yearly_discount_percent": float(get_setting(db, "yearly_discount_percent", "20")),
        "yearly_discount_coupon_id": coupon_id,
        "payment_failed_lock_retries": int(
            get_setting(db, "payment_failed_lock_retries", str(settings.payment_failed_lock_retries))
        ),
    }


def update_billing_settings(db: Session, data: dict[str, Any]) -> dict[str, Any]:
    if "yearly_discount_percent" in data and data["yearly_discount_percent"] is not None:
        set_setting(db, "yearly_discount_percent", str(data["yearly_discount_percent"]))
    if "payment_failed_lock_retries" in data and data["payment_failed_lock_retries"] is not None:
        set_setting(db, "payment_failed_lock_retries", str(data["payment_failed_lock_retries"]))
    return get_billing_settings(db)
