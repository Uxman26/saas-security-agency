from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException
from typing import List, Optional
from datetime import date, datetime, timezone
from app.models import Account, Payment, Invoice, InvoiceLine
from app.schemas import PaymentCreate, PaymentUpdate
from app.services.company_service import get_company_by_user_id
from app.services.invoice_payment_service import sync_invoice_payment_status
from app.services.invoice_service import log_invoice_audit
from app.services.recycle_bin import archive as _bin_archive


def _assert_within_balance(
    db: Session, inv: Invoice, amount: float, exclude_payment_id: Optional[int] = None
) -> None:
    """
    Reject a payment that would take an invoice past its total. `exclude_payment_id`
    leaves the row being edited out of the existing-paid sum, so updating a payment
    is not compared against itself.
    """
    from app.services.credit_note_service import invoice_credit_applied

    total = round(float(inv.total or 0), 2)
    if total <= 0:
        return
    q = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.invoice_id == inv.id,
        Payment.deleted_at.is_(None),
    )
    if exclude_payment_id is not None:
        q = q.filter(Payment.id != exclude_payment_id)
    already = round(float(q.scalar() or 0), 2)
    credited = invoice_credit_applied(db, inv.id)
    balance = round(total - already - credited, 2)
    if round(amount, 2) > balance + 0.005:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Payment of {amount:.2f} exceeds the remaining balance of {balance:.2f} "
                f"on invoice #{inv.id} (total {total:.2f}, already paid {already:.2f}, "
                f"credited {credited:.2f})."
            ),
        )


def _assert_deposit_account(db: Session, company_id: int, account_id: Optional[int]) -> None:
    if account_id is None:
        return
    from app.services import accounting_service

    if account_id not in {a.id for a in accounting_service.deposit_accounts(db, company_id)}:
        raise HTTPException(status_code=400, detail="Choose an account that can receive payments")


def deposit_accounts(db: Session, user_id: int) -> List[Account]:
    from app.services import accounting_service

    company = get_company_by_user_id(db, user_id)
    return accounting_service.deposit_accounts(db, company.id)


def create_payment(db: Session, data: PaymentCreate, user_id: int) -> Payment:
    company = get_company_by_user_id(db, user_id)
    if data.amount is None or data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    if data.amount > 99_999_999.99:
        raise HTTPException(status_code=400, detail="Amount is too large")
    inv = None
    if data.invoice_id is None:
        raise HTTPException(status_code=400, detail="Invoice is required")
    inv = (
        db.query(Invoice)
        .filter(
            Invoice.id == data.invoice_id,
            Invoice.company_id == company.id,
            Invoice.deleted_at.is_(None),
        )
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.status in ("draft", "cancelled"):
        raise HTTPException(
            status_code=400,
            detail="Cannot record a payment against a draft or cancelled invoice",
        )
    _assert_within_balance(db, inv, float(data.amount))
    _assert_deposit_account(db, company.id, data.account_id)
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    payload["memo"] = (payload.get("memo") or "").strip() or None
    pay = Payment(company_id=company.id, **payload)
    db.add(pay)
    db.flush()
    if inv:
        sync_invoice_payment_status(db, inv, user_id)
        log_invoice_audit(db, company.id, user_id, inv.id, "payment_recorded", {"amount": pay.amount, "payment_id": pay.id})
    db.commit()
    db.refresh(pay)
    try:
        from app.services import accounting_service
        accounting_service.post_payment(db, company.id, pay)
    except Exception:
        pass
    return pay

def get_payments(db: Session, user_id: int, invoice_id: Optional[int] = None) -> List[Payment]:
    company = get_company_by_user_id(db, user_id)
    q = (
        db.query(Payment)
        .options(
            selectinload(Payment.invoice).selectinload(Invoice.lines).selectinload(InvoiceLine.site),
            selectinload(Payment.invoice).selectinload(Invoice.client),
            selectinload(Payment.reviewed_by),
        )
        .filter(Payment.company_id == company.id, Payment.deleted_at.is_(None))
    )
    if invoice_id:
        q = q.filter(Payment.invoice_id == invoice_id)
    return q.order_by(Payment.paid_at.desc()).all()

def get_payment(db: Session, payment_id: int, user_id: int) -> Payment:
    company = get_company_by_user_id(db, user_id)
    pay = db.query(Payment).filter(
        Payment.id == payment_id, Payment.company_id == company.id, Payment.deleted_at.is_(None)
    ).first()
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    return pay

def delete_payment(db: Session, payment_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    pay = db.query(Payment).filter(Payment.id == payment_id, Payment.company_id == company.id).first()
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    inv_id = pay.invoice_id
    _bin_archive(pay, user_id)
    _unpost_payment(db, company.id, pay.id)
    db.flush()
    if inv_id:
        inv = db.query(Invoice).filter(Invoice.id == inv_id, Invoice.company_id == company.id).first()
        if inv:
            sync_invoice_payment_status(db, inv, user_id)
            log_invoice_audit(db, company.id, user_id, inv.id, "payment_deleted", {"payment_id": payment_id})
    db.commit()


def _unpost_payment(db: Session, company_id: int, payment_id: int) -> None:
    """Take a removed payment's money back out of the ledger."""
    from app.services import accounting_service

    accounting_service.unpost(db, company_id, "payment", payment_id)


def revert_invoice_payments(db: Session, invoice_id: int, user_id: int) -> Invoice:
    """Undo every payment recorded on an invoice. The payments go to the recycle bin, their
    ledger entries are removed, and the invoice drops back to Sent / Overdue."""
    company = get_company_by_user_id(db, user_id)
    inv = db.query(Invoice).filter(
        Invoice.id == invoice_id, Invoice.company_id == company.id, Invoice.deleted_at.is_(None)
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    pays = db.query(Payment).filter(
        Payment.invoice_id == inv.id, Payment.company_id == company.id, Payment.deleted_at.is_(None)
    ).all()
    if not pays:
        raise HTTPException(status_code=400, detail="This invoice has no payments to revert")
    prev = inv.status
    reverted = []
    for pay in pays:
        _bin_archive(pay, user_id)
        _unpost_payment(db, company.id, pay.id)
        reverted.append({"payment_id": pay.id, "amount": float(pay.amount or 0)})
    db.flush()
    sync_invoice_payment_status(db, inv, user_id)
    log_invoice_audit(
        db, company.id, user_id, inv.id, "payments_reverted",
        {"payments": reverted, "from": prev, "to": inv.status},
    )
    db.commit()
    db.refresh(inv)
    return inv


def update_payment(db: Session, payment_id: int, data: PaymentUpdate, user_id: int) -> Payment:
    company = get_company_by_user_id(db, user_id)
    pay = db.query(Payment).filter(Payment.id == payment_id, Payment.company_id == company.id).first()
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    payload = data.model_dump(exclude_unset=True) if hasattr(data, "model_dump") else data.dict(exclude_unset=True)
    old_inv_id = pay.invoice_id
    _assert_deposit_account(db, company.id, payload.get("account_id"))
    if "amount" in payload and payload["amount"] is not None and payload["amount"] <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    if "amount" in payload and payload["amount"] is not None and payload["amount"] > 99_999_999.99:
        raise HTTPException(status_code=400, detail="Amount is too large")
    if "invoice_id" in payload and payload["invoice_id"] is not None:
        inv = db.query(Invoice).filter(
            Invoice.id == payload["invoice_id"],
            Invoice.company_id == company.id,
            Invoice.deleted_at.is_(None),
        ).first()
        if not inv:
            raise HTTPException(status_code=404, detail="Invoice not found")
    # Validate against the invoice this payment will end up on, using the amount it
    # will end up with. Excluding itself keeps an unchanged edit from self-blocking.
    target_inv_id = payload.get("invoice_id", old_inv_id)
    target_amount = payload.get("amount", pay.amount)
    if target_inv_id and target_amount is not None:
        target_inv = db.query(Invoice).filter(
            Invoice.id == target_inv_id, Invoice.company_id == company.id
        ).first()
        if target_inv:
            _assert_within_balance(db, target_inv, float(target_amount), exclude_payment_id=pay.id)
    for k, v in payload.items():
        setattr(pay, k, v)
    db.flush()
    touched = {old_inv_id, pay.invoice_id}
    for inv_id in touched:
        if not inv_id:
            continue
        inv = db.query(Invoice).filter(Invoice.id == inv_id, Invoice.company_id == company.id).first()
        if inv:
            sync_invoice_payment_status(db, inv, user_id)
            log_invoice_audit(db, company.id, user_id, inv.id, "payment_updated", {"payment_id": pay.id, "amount": pay.amount})
    db.commit()
    db.refresh(pay)
    return pay


def set_payment_reviewed(db: Session, payment_id: int, reviewed: bool, user_id: int) -> Payment:
    """Tick a transaction off as checked (or undo it). Changes nothing else on the payment."""
    pay = get_payment(db, payment_id, user_id)
    if reviewed:
        pay.reviewed_at = datetime.now(timezone.utc)
        pay.reviewed_by_user_id = user_id
    else:
        pay.reviewed_at = None
        pay.reviewed_by_user_id = None
    db.commit()
    db.refresh(pay)
    return pay
