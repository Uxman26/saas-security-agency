from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.models import User
from app.schemas import InvoiceCreate, InvoiceResponse, InvoiceLineBase, InvoiceLineResponse
from app.rbac import require_perm, PERM_INV_READ, PERM_INV_WRITE, PERM_INV_DELETE
from app.services import invoice_service

router = APIRouter(prefix="/invoices", tags=["invoices"])

@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(data: InvoiceCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_INV_WRITE))):
    return invoice_service.create_invoice(db, data, current_user.id)

@router.post("/generate", response_model=InvoiceResponse)
def generate_invoice(client_id: int, period_start: date, period_end: date, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_INV_WRITE))):
    return invoice_service.generate_from_assignments(db, client_id, period_start, period_end, current_user.id)

@router.get("", response_model=List[InvoiceResponse])
def list_invoices(client_id: Optional[int] = None, status: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_INV_READ))):
    return invoice_service.get_invoices(db, current_user.id, client_id, status)

@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_INV_READ))):
    return invoice_service.get_invoice(db, invoice_id, current_user.id)

@router.patch("/{invoice_id}/status", response_model=InvoiceResponse)
def update_status(invoice_id: int, status: str, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_INV_WRITE))):
    return invoice_service.update_invoice_status(db, invoice_id, status, current_user.id)

@router.post("/{invoice_id}/lines", response_model=InvoiceLineResponse, status_code=status.HTTP_201_CREATED)
def add_line(invoice_id: int, data: InvoiceLineBase, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_INV_WRITE))):
    return invoice_service.add_invoice_line(db, invoice_id, data, current_user.id)

@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_INV_DELETE))):
    invoice_service.delete_invoice(db, invoice_id, current_user.id)
    return None
