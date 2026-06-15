from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
from app.models import Payment, Invoice
from app.schemas import PaymentCreate
from app.services.company_service import get_company_by_user_id
from app.services.invoice_payment_service import sync_invoice_payment_status
from app.services.invoice_service import log_invoice_audit


def create_payment(db: Session, data: PaymentCreate, user_id: int) -> Payment:
    company = get_company_by_user_id(db, user_id)
    inv = None
    if data.invoice_id is not None:
        inv = db.query(Invoice).filter(Invoice.id == data.invoice_id, Invoice.company_id == company.id).first()
        if not inv:
            raise HTTPException(status_code=404, detail="Invoice not found")
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    pay = Payment(company_id=company.id, **payload)
    db.add(pay)
    db.flush()
    if inv:
        sync_invoice_payment_status(db, inv)
        log_invoice_audit(db, company.id, user_id, inv.id, "payment_recorded", {"amount": pay.amount, "payment_id": pay.id})
    db.commit()
    db.refresh(pay)
    return pay

def get_payments(db: Session, user_id: int, invoice_id: Optional[int] = None) -> List[Payment]:
    company = get_company_by_user_id(db, user_id)
    q = db.query(Payment).filter(Payment.company_id == company.id)
    if invoice_id:
        q = q.filter(Payment.invoice_id == invoice_id)
    return q.order_by(Payment.paid_at.desc()).all()

def get_payment(db: Session, payment_id: int, user_id: int) -> Payment:
    company = get_company_by_user_id(db, user_id)
    pay = db.query(Payment).filter(Payment.id == payment_id, Payment.company_id == company.id).first()
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    return pay

def delete_payment(db: Session, payment_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    pay = db.query(Payment).filter(Payment.id == payment_id, Payment.company_id == company.id).first()
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    inv_id = pay.invoice_id
    db.delete(pay)
    db.flush()
    if inv_id:
        inv = db.query(Invoice).filter(Invoice.id == inv_id, Invoice.company_id == company.id).first()
        if inv:
            sync_invoice_payment_status(db, inv)
            log_invoice_audit(db, company.id, user_id, inv.id, "payment_deleted", {"payment_id": payment_id})
    db.commit()
