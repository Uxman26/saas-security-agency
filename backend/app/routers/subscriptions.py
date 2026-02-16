from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import SubscriptionUpdate, CompanyResponse
from app.auth import get_current_user
from app.services import subscription_service

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

@router.get("", response_model=CompanyResponse)
def get_subscription(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return subscription_service.get_subscription(db, current_user.id)

@router.put("", response_model=CompanyResponse)
def update_subscription(data: SubscriptionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return subscription_service.update_subscription(db, data, current_user.id)
