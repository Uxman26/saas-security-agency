from __future__ import annotations

from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import SpecialDayCreate, SpecialDayResponse, SeedUkYear
from app.rbac import require_module
from app.services import special_day_service

router = APIRouter(prefix="/special-days", tags=["special-days"])


@router.get("", response_model=List[SpecialDayResponse])
def list_special_days(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("allowances", "view")),
):
    if start_date is not None and end_date is not None:
        return special_day_service.list_in_range(db, current_user.id, start_date, end_date)
    return special_day_service.list_all(db, current_user.id)


@router.post("", response_model=SpecialDayResponse, status_code=status.HTTP_201_CREATED)
def create_special_day(
    data: SpecialDayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("allowances", "edit")),
):
    return special_day_service.create_day(db, current_user.id, data.date, data.label)


@router.post("/seed-uk", response_model=dict)
def seed_uk_holidays(
    body: SeedUkYear,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("allowances", "edit")),
):
    n = special_day_service.seed_uk_bank_holidays(db, current_user.id, body.year)
    return {"added": n, "year": body.year}


@router.delete("/{day_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_special_day(
    day_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("allowances", "delete")),
):
    special_day_service.delete_day(db, current_user.id, day_id)
    return None
