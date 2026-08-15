from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.schemas import SubscriptionUpdate, CompanyResponse, PlanTierOut
from app.rbac import require_internal_module
from app.services import subscription_service
from app.services import platform_plans_service

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

@router.get("/packages", response_model=List[PlanTierOut])
def list_packages():
    return [PlanTierOut(**row) for row in platform_plans_service.list_tiers()]

@router.get("", response_model=CompanyResponse)
def get_subscription(db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "view"))):
    return subscription_service.get_subscription(db, current_user.id)

@router.put("", response_model=CompanyResponse)
def update_subscription(data: SubscriptionUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "edit"))):
    return subscription_service.update_subscription(db, data, current_user.id)
