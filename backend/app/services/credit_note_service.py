from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import Client, CreditNote, Invoice, Site
from app.services.company_service import get_company_by_user_id
from app.services.invoice_payment_service import sync_invoice_payment_status
from app.services.invoice_service import log_invoice_audit
from app.services.recycle_bin import archive as _bin_archive

ISSUED = "issued"
DRAFT = "draft"
CANCELLED = "cancelled"
ACTIVE_STATUSES = (ISSUED,)


def _money(v) -> float:
    return round(float(v or 0), 2)


def _compute_totals(subtotal: float, tax_rate: float) -> tuple[float, float, float]:
    sub = _money(subtotal)
    rate = float(tax_rate or 0)
    if rate < 0 or rate > 100:
        raise HTTPException(status_code=400, detail="Tax rate must be between 0 and 100")
    tax = _money(sub * rate / 100)
    return sub, tax, _money(sub + tax)


def invoice_credit_applied(
    db: Session, invoice_id: int, *, exclude_id: Optional[int] = None
) -> float:
    q = db.query(func.coalesce(func.sum(CreditNote.total), 0)).filter(
        CreditNote.invoice_id == invoice_id,
        CreditNote.status.in_(ACTIVE_STATUSES),
    )
    if exclude_id is not None:
        q = q.filter(CreditNote.id != exclude_id)
    return _money(q.scalar())


def _assert_within_remaining(
    db: Session,
    inv: Invoice,
    credit_total: float,
    *,
    exclude_credit_id: Optional[int] = None,
) -> None:
    from app.services.invoice_payment_service import invoice_amount_paid

    total = _money(inv.total)
    if total <= 0:
        return
    paid = invoice_amount_paid(db, inv.id)
    credited = invoice_credit_applied(db, inv.id, exclude_id=exclude_credit_id)
    remaining = _money(total - paid - credited)
    if _money(credit_total) > remaining + 0.005:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Credit of {_money(credit_total):.2f} exceeds the remaining balance of "
                f"{remaining:.2f} on invoice #{inv.id} "
                f"(total {total:.2f}, paid {paid:.2f}, already credited {credited:.2f})."
            ),
        )


def _serialize(cn: CreditNote) -> dict:
    inv = cn.invoice
    client = cn.client
    site = cn.site
    return {
        "id": cn.id,
        "company_id": cn.company_id,
        "invoice_id": cn.invoice_id,
        "client_id": cn.client_id,
        "site_id": cn.site_id,
        "number": cn.number,
        "credit_date": cn.credit_date,
        "reason": cn.reason,
        "description": cn.description,
        "subtotal": cn.subtotal,
        "tax_rate": cn.tax_rate,
        "tax_amount": cn.tax_amount,
        "total": cn.total,
        "status": cn.status,
        "created_at": cn.created_at,
        "updated_at": cn.updated_at,
        "invoice_number": f"INV-{cn.invoice_id}" if cn.invoice_id else None,
        "client_name": client.name if client else (inv.client.name if inv and inv.client else None),
        "site_name": site.name if site else None,
    }


def _load(db: Session, credit_note_id: int, company_id: int) -> CreditNote:
    row = (
        db.query(CreditNote)
        .options(
            joinedload(CreditNote.invoice).joinedload(Invoice.client),
            joinedload(CreditNote.client),
            joinedload(CreditNote.site),
        )
        .filter(CreditNote.id == credit_note_id, CreditNote.company_id == company_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Credit note not found")
    return row


def list_credit_notes(
    db: Session,
    user_id: int,
    *,
    invoice_id: Optional[int] = None,
    client_id: Optional[int] = None,
    status: Optional[str] = None,
) -> list[dict]:
    company = get_company_by_user_id(db, user_id)
    q = (
        db.query(CreditNote)
        .options(
            joinedload(CreditNote.invoice).joinedload(Invoice.client),
            joinedload(CreditNote.client),
            joinedload(CreditNote.site),
        )
        .filter(CreditNote.company_id == company.id)
    )
    if invoice_id:
        q = q.filter(CreditNote.invoice_id == invoice_id)
    if client_id:
        q = q.filter(CreditNote.client_id == client_id)
    if status:
        q = q.filter(CreditNote.status == status)
    rows = q.order_by(CreditNote.credit_date.desc(), CreditNote.id.desc()).all()
    return [_serialize(r) for r in rows]


def get_credit_note(db: Session, credit_note_id: int, user_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    return _serialize(_load(db, credit_note_id, company.id))


def create_credit_note(db: Session, data: dict, user_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    invoice_id = data.get("invoice_id")
    if not invoice_id:
        raise HTTPException(status_code=400, detail="Invoice is required")
    inv = (
        db.query(Invoice)
        .options(joinedload(Invoice.lines), joinedload(Invoice.client))
        .filter(Invoice.id == invoice_id, Invoice.company_id == company.id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.status in ("draft", "cancelled"):
        raise HTTPException(status_code=400, detail="Cannot credit a draft or cancelled invoice")

    client_id = data.get("client_id") or inv.client_id
    if client_id:
        client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        if inv.client_id and inv.client_id != client_id:
            raise HTTPException(status_code=400, detail="Client does not match the invoice")

    site_id = data.get("site_id")
    if site_id:
        site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        if site.client_id and client_id and site.client_id != client_id:
            raise HTTPException(status_code=400, detail="Site does not belong to the selected client")
        inv_site_ids = {ln.site_id for ln in (inv.lines or []) if ln.site_id}
        if inv_site_ids and site_id not in inv_site_ids:
            raise HTTPException(status_code=400, detail="Site is not on the selected invoice")

    subtotal = data.get("subtotal")
    if subtotal is None:
        raise HTTPException(status_code=400, detail="Credited amount (subtotal) is required")
    if float(subtotal) <= 0:
        raise HTTPException(status_code=400, detail="Credited amount must be greater than zero")
    tax_rate = data.get("tax_rate")
    if tax_rate is None:
        tax_rate = inv.tax_rate or 0
    sub, tax, total = _compute_totals(float(subtotal), float(tax_rate))

    status = (data.get("status") or ISSUED).strip().lower()
    if status not in (DRAFT, ISSUED):
        raise HTTPException(status_code=400, detail="Status must be draft or issued")
    if status == ISSUED:
        _assert_within_remaining(db, inv, total)

    credit_date = data.get("credit_date") or date.today()
    if isinstance(credit_date, datetime):
        credit_date = credit_date.date()
    elif isinstance(credit_date, str):
        credit_date = date.fromisoformat(credit_date[:10])

    row = CreditNote(
        company_id=company.id,
        invoice_id=inv.id,
        client_id=client_id,
        site_id=site_id,
        number="PENDING",
        credit_date=credit_date,
        reason=(data.get("reason") or "").strip() or None,
        description=(data.get("description") or "").strip() or None,
        subtotal=sub,
        tax_rate=float(tax_rate or 0),
        tax_amount=tax,
        total=total,
        status=status,
    )
    db.add(row)
    db.flush()
    row.number = (data.get("number") or "").strip() or f"CN-{row.id:05d}"
    if status == ISSUED:
        sync_invoice_payment_status(db, inv, user_id)
    log_invoice_audit(
        db,
        company.id,
        user_id,
        inv.id,
        "credit_note_created",
        {
            "credit_note_id": row.id,
            "number": row.number,
            "total": row.total,
            "status": row.status,
            "reason": row.reason,
        },
    )
    db.commit()
    return _serialize(_load(db, row.id, company.id))


def update_credit_note(db: Session, credit_note_id: int, data: dict, user_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    row = _load(db, credit_note_id, company.id)
    if row.status == CANCELLED:
        raise HTTPException(status_code=400, detail="Cancelled credit notes cannot be edited")
    inv = (
        db.query(Invoice)
        .options(joinedload(Invoice.lines))
        .filter(Invoice.id == row.invoice_id, Invoice.company_id == company.id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if "reason" in data:
        row.reason = (data.get("reason") or "").strip() or None
    if "description" in data:
        row.description = (data.get("description") or "").strip() or None
    if "credit_date" in data and data["credit_date"] is not None:
        cd = data["credit_date"]
        if isinstance(cd, datetime):
            row.credit_date = cd.date()
        elif isinstance(cd, str):
            row.credit_date = date.fromisoformat(cd[:10])
        else:
            row.credit_date = cd
    if "site_id" in data:
        site_id = data.get("site_id")
        if site_id:
            site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
            if not site:
                raise HTTPException(status_code=404, detail="Site not found")
            inv_site_ids = {ln.site_id for ln in (inv.lines or []) if ln.site_id}
            if inv_site_ids and site_id not in inv_site_ids:
                raise HTTPException(status_code=400, detail="Site is not on the selected invoice")
            row.site_id = site_id
        else:
            row.site_id = None

    subtotal = data.get("subtotal", row.subtotal)
    tax_rate = data.get("tax_rate", row.tax_rate)
    if float(subtotal) <= 0:
        raise HTTPException(status_code=400, detail="Credited amount must be greater than zero")
    sub, tax, total = _compute_totals(float(subtotal), float(tax_rate or 0))
    if row.status == ISSUED or (data.get("status") == ISSUED):
        _assert_within_remaining(db, inv, total, exclude_credit_id=row.id)
    row.subtotal = sub
    row.tax_rate = float(tax_rate or 0)
    row.tax_amount = tax
    row.total = total

    prev_status = row.status
    if "status" in data and data["status"] is not None:
        new_status = str(data["status"]).strip().lower()
        if new_status not in (DRAFT, ISSUED, CANCELLED):
            raise HTTPException(status_code=400, detail="Invalid status")
        if new_status == CANCELLED:
            raise HTTPException(status_code=400, detail="Use cancel endpoint to cancel a credit note")
        if prev_status == DRAFT and new_status == ISSUED:
            _assert_within_remaining(db, inv, total, exclude_credit_id=row.id)
            row.status = ISSUED
        elif prev_status == ISSUED and new_status == DRAFT:
            raise HTTPException(status_code=400, detail="Issued credit notes cannot return to draft; cancel instead")
        else:
            row.status = new_status

    sync_invoice_payment_status(db, inv, user_id)
    log_invoice_audit(
        db,
        company.id,
        user_id,
        inv.id,
        "credit_note_updated",
        {
            "credit_note_id": row.id,
            "number": row.number,
            "total": row.total,
            "status": row.status,
            "previous_status": prev_status,
        },
    )
    db.commit()
    return _serialize(_load(db, row.id, company.id))


def issue_credit_note(db: Session, credit_note_id: int, user_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    row = _load(db, credit_note_id, company.id)
    if row.status == ISSUED:
        return _serialize(row)
    if row.status == CANCELLED:
        raise HTTPException(status_code=400, detail="Cancelled credit notes cannot be issued")
    inv = db.query(Invoice).filter(Invoice.id == row.invoice_id, Invoice.company_id == company.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _assert_within_remaining(db, inv, float(row.total), exclude_credit_id=row.id)
    row.status = ISSUED
    sync_invoice_payment_status(db, inv, user_id)
    log_invoice_audit(
        db,
        company.id,
        user_id,
        inv.id,
        "credit_note_issued",
        {"credit_note_id": row.id, "number": row.number, "total": row.total},
    )
    db.commit()
    return _serialize(_load(db, row.id, company.id))


def cancel_credit_note(db: Session, credit_note_id: int, user_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    row = _load(db, credit_note_id, company.id)
    if row.status == CANCELLED:
        return _serialize(row)
    inv = db.query(Invoice).filter(Invoice.id == row.invoice_id, Invoice.company_id == company.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    prev = row.status
    row.status = CANCELLED
    sync_invoice_payment_status(db, inv, user_id)
    log_invoice_audit(
        db,
        company.id,
        user_id,
        inv.id,
        "credit_note_cancelled",
        {"credit_note_id": row.id, "number": row.number, "total": row.total, "previous_status": prev},
    )
    db.commit()
    return _serialize(_load(db, row.id, company.id))


def delete_credit_note(db: Session, credit_note_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    row = _load(db, credit_note_id, company.id)
    if row.status == ISSUED:
        raise HTTPException(status_code=400, detail="Cancel the credit note before deleting it")
    inv_id = row.invoice_id
    _bin_archive(row, user_id)
    db.flush()
    if inv_id:
        inv = db.query(Invoice).filter(Invoice.id == inv_id, Invoice.company_id == company.id).first()
        if inv:
            sync_invoice_payment_status(db, inv, user_id)
            log_invoice_audit(
                db,
                company.id,
                user_id,
                inv.id,
                "credit_note_deleted",
                {"credit_note_id": credit_note_id, "number": row.number},
            )
    db.commit()
