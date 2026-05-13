from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Company, User
from app.schemas import SubscriptionUpdate
from app.services.company_service import get_company_by_user_id
from app.auth import SUPER_ADMIN_ROLE

TIERS = {"basic", "starter", "standard", "premium", "enterprise"}


def _company_scoped_user(db: Session, user_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == SUPER_ADMIN_ROLE and not user.company_id:
        raise HTTPException(status_code=400, detail="Subscription is tied to a company account")


def update_subscription(db: Session, data: SubscriptionUpdate, user_id: int) -> Company:
    _company_scoped_user(db, user_id)
    company = get_company_by_user_id(db, user_id)
    # if data.subscription_tier not in TIERS:
    #     raise HTTPException(status_code=400, detail="Invalid subscription tier")
    company.subscription_tier = data.subscription_tier
    db.commit()
    db.refresh(company)
    return company


def get_subscription(db: Session, user_id: int) -> Company:
    _company_scoped_user(db, user_id)
    return get_company_by_user_id(db, user_id)
