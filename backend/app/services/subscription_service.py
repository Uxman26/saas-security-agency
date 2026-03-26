from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Company
from app.schemas import SubscriptionUpdate
from app.services.company_service import get_company_by_user_id

TIERS = {"basic", "standard", "premium", "enterprise"}

def update_subscription(db: Session, data: SubscriptionUpdate, user_id: int) -> Company:
    company = get_company_by_user_id(db, user_id)
    if data.subscription_tier not in TIERS:
        raise HTTPException(status_code=400, detail="Invalid subscription tier")
    company.subscription_tier = data.subscription_tier
    db.commit()
    db.refresh(company)
    return company

def get_subscription(db: Session, user_id: int) -> Company:
    return get_company_by_user_id(db, user_id)
