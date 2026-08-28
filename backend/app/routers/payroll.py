from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from pydantic import BaseModel
from app.database import get_db
from app.models import User
from app.schemas import PayrollPreviewResponse, PayrollCreate, PayrollUpdate, PayrollResponse
from app.rbac import require_internal_module
from app.services import payroll_service

router = APIRouter(prefix="/payroll", tags=["payroll"])


class PayrollBatchRequest(BaseModel):
    mode: str  # employee | site | rota
    period_start: date
    period_end: date
    guard_id: Optional[int] = None
    site_id: Optional[int] = None
    rota_plan_id: Optional[int] = None

@router.post("", response_model=PayrollResponse, status_code=status.HTTP_201_CREATED)
def create_payroll(data: PayrollCreate, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payroll", "create"))):
    return payroll_service.create_payroll(db, data, current_user.id)

@router.post("/calculate", response_model=PayrollResponse)
def calculate_payroll(guard_id: int, period_start: date, period_end: date, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payroll", "calculate"))):
    return payroll_service.calculate_payroll(db, guard_id, period_start, period_end, current_user.id)

@router.post("/calculate-batch", response_model=List[PayrollResponse])
def calculate_payroll_batch(body: PayrollBatchRequest, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payroll", "calculate_batch"))):
    return payroll_service.calculate_payroll_batch(
        db,
        current_user.id,
        body.period_start,
        body.period_end,
        body.mode,
        guard_id=body.guard_id,
        site_id=body.site_id,
        rota_plan_id=body.rota_plan_id,
    )

@router.get("", response_model=List[PayrollResponse])
def list_payrolls(guard_id: Optional[int] = None, period_start: Optional[date] = None, period_end: Optional[date] = None, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payroll", "view"))):
    return payroll_service.get_payrolls(db, current_user.id, guard_id, period_start, period_end)

@router.get("/preview", response_model=PayrollPreviewResponse)
def preview_pay(
    period_start: date,
    period_end: date,
    guard_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("payroll", "view")),
):
    """Hours and pay over a date range. Saves nothing.

    Omit guard_id for every employee, which is what the screen loads with.

    Declared above /{payroll_id} deliberately: FastAPI matches in order, so the dynamic
    route would otherwise swallow "preview" and fail on the int conversion.
    """
    return payroll_service.preview_pay(db, current_user.id, guard_id, period_start, period_end)


@router.get("/{payroll_id}", response_model=PayrollResponse)
def get_payroll(payroll_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payroll", "view"))):
    return payroll_service.get_payroll(db, payroll_id, current_user.id)

@router.put("/{payroll_id}", response_model=PayrollResponse)
def update_payroll(payroll_id: int, data: PayrollUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payroll", "edit"))):
    return payroll_service.update_payroll(db, payroll_id, data, current_user.id)

@router.delete("/{payroll_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payroll(payroll_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payroll", "delete"))):
    payroll_service.delete_payroll(db, payroll_id, current_user.id)
    return None
