from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import User
from app.schemas import PaymentCreate, PaymentUpdate, PaymentResponse
from app.rbac import require_internal_module
from app.services import payment_service

router = APIRouter(prefix="/payments", tags=["payments"])

@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def create_payment(data: PaymentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payments", "create"))):
    return payment_service.create_payment(db, data, current_user.id)

@router.get("", response_model=List[PaymentResponse])
def list_payments(invoice_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payments", "view"))):
    return payment_service.get_payments(db, current_user.id, invoice_id)

@router.get("/{payment_id}", response_model=PaymentResponse)
def get_payment(payment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payments", "view"))):
    return payment_service.get_payment(db, payment_id, current_user.id)

@router.put("/{payment_id}", response_model=PaymentResponse)
def update_payment(payment_id: int, data: PaymentUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payments", "edit"))):
    return payment_service.update_payment(db, payment_id, data, current_user.id)

@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("payments", "delete"))):
    payment_service.delete_payment(db, payment_id, current_user.id)
    return None
