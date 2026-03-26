from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.models import User
from app.schemas import PayrollCreate, PayrollResponse
from app.auth import get_current_user
from app.services import payroll_service

router = APIRouter(prefix="/payroll", tags=["payroll"])

@router.post("", response_model=PayrollResponse, status_code=status.HTTP_201_CREATED)
def create_payroll(data: PayrollCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return payroll_service.create_payroll(db, data, current_user.id)

@router.post("/calculate", response_model=PayrollResponse)
def calculate_payroll(guard_id: int, period_start: date, period_end: date, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return payroll_service.calculate_payroll(db, guard_id, period_start, period_end, current_user.id)

@router.get("", response_model=List[PayrollResponse])
def list_payrolls(guard_id: Optional[int] = None, period_start: Optional[date] = None, period_end: Optional[date] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return payroll_service.get_payrolls(db, current_user.id, guard_id, period_start, period_end)

@router.get("/{payroll_id}", response_model=PayrollResponse)
def get_payroll(payroll_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return payroll_service.get_payroll(db, payroll_id, current_user.id)

@router.delete("/{payroll_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payroll(payroll_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    payroll_service.delete_payroll(db, payroll_id, current_user.id)
    return None
