from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.schemas import GuardRateCreate, GuardRateResponse, SiteRateCreate, SiteRateResponse
from app.rbac import require_module
from app.services import rate_service

router = APIRouter(prefix="/rates", tags=["rates"])

@router.post("/guards/{guard_id}", response_model=GuardRateResponse, status_code=status.HTTP_201_CREATED)
def create_guard_rate(guard_id: int, data: GuardRateCreate, db: Session = Depends(get_db), current_user: User = Depends(require_module("company", "edit"))):
    return rate_service.create_guard_rate(db, guard_id, data, current_user.id)

@router.get("/guards/{guard_id}", response_model=List[GuardRateResponse])
def list_guard_rates(guard_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("company", "view"))):
    return rate_service.get_guard_rates(db, guard_id, current_user.id)

@router.delete("/guards/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guard_rate(rate_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("company", "delete"))):
    rate_service.delete_guard_rate(db, rate_id, current_user.id)
    return None

@router.post("/sites/{site_id}", response_model=SiteRateResponse, status_code=status.HTTP_201_CREATED)
def create_site_rate(site_id: int, data: SiteRateCreate, db: Session = Depends(get_db), current_user: User = Depends(require_module("company", "edit"))):
    return rate_service.create_site_rate(db, site_id, data, current_user.id)

@router.get("/sites/{site_id}", response_model=List[SiteRateResponse])
def list_site_rates(site_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("company", "view"))):
    return rate_service.get_site_rates(db, site_id, current_user.id)

@router.delete("/sites/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site_rate(rate_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("company", "delete"))):
    rate_service.delete_site_rate(db, rate_id, current_user.id)
    return None
