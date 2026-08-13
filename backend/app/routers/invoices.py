from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi import status as http_status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.models import User, Invoice, InvoiceLine, Payment
from app.schemas import (
    InvoiceCreate,
    InvoiceResponse,
    InvoiceLineBase,
    InvoiceLineResponse,
    InvoiceUpdate,
    InvoiceLineUpdate,
    InvoiceAuditEntry,
    PaymentResponse,
)
from app.rbac import require_module, user_has_permission_db
from app.services import invoice_service
from app.services.invoice_pdf import render_invoice_pdf
from app.services.invoice_payment_service import invoice_amount_paid
from app.services.company_profile_service import company_logo_url

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _serialize_invoice(inv: Invoice, include_lines: bool, db: Session | None = None) -> InvoiceResponse:
    lines_out: list[InvoiceLineResponse] = []
    if include_lines:
        for ln in sorted(inv.lines, key=lambda x: x.id):
            site = getattr(ln, "site", None)
            g = getattr(ln, "guard", None)
            lines_out.append(
                InvoiceLineResponse(
                    id=ln.id,
                    invoice_id=ln.invoice_id,
                    site_id=ln.site_id,
                    guard_id=ln.guard_id,
                    hours=ln.hours,
                    rate=ln.rate,
                    amount=ln.amount,
                    allowance_amount=ln.allowance_amount,
                    created_at=ln.created_at,
                    site_name=site.name if site else None,
                    guard_name=g.full_name if g else None,
                )
            )
    co = inv.company
    cl = inv.client
    admin = None
    if db and co:
        admin = db.query(User).filter(User.id == co.admin_id).first()
    company_email = None
    company_phone = None
    company_address = None
    company_registration_number = None
    company_vat_number = None
    company_logo_url_val = None
    account_name = None
    bank_name = None
    sort_code = None
    account_number = None
    iban = None
    swift_code = None
    if co:
        company_email = (co.email or "").strip() or (admin.email if admin else None)
        company_phone = co.phone
        company_address = co.address
        company_registration_number = co.registration_number
        company_vat_number = co.vat_number
        company_logo_url_val = company_logo_url(co)
        account_name = co.account_name
        bank_name = co.bank_name
        sort_code = co.sort_code
        account_number = co.account_number
        iban = co.iban
        swift_code = co.swift_code
    paid = invoice_amount_paid(db, inv.id) if db else 0
    payments_out = []
    if db and include_lines:
        for p in db.query(Payment).filter(Payment.invoice_id == inv.id).order_by(Payment.paid_at.desc()).all():
            payments_out.append(
                PaymentResponse(
                    id=p.id,
                    company_id=p.company_id,
                    invoice_id=p.invoice_id,
                    amount=p.amount,
                    method=p.method,
                    paid_at=p.paid_at,
                    created_at=p.created_at,
                )
            )
    total = float(inv.total or 0)
    return InvoiceResponse(
        id=inv.id,
        company_id=inv.company_id,
        client_id=inv.client_id,
        period_start=inv.period_start,
        period_end=inv.period_end,
        total=inv.total,
        status=inv.status,
        due_date=inv.due_date,
        notes=inv.notes,
        tax_rate=inv.tax_rate or 0,
        subtotal=inv.subtotal or 0,
        tax_amount=inv.tax_amount or 0,
        pdf_path=inv.pdf_path,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
        client_name=cl.name if cl else None,
        company_name=co.name if co else None,
        company_email=company_email,
        company_phone=company_phone,
        company_address=company_address,
        company_registration_number=company_registration_number,
        company_vat_number=company_vat_number,
        company_logo_url=company_logo_url_val,
        account_name=account_name,
        bank_name=bank_name,
        sort_code=sort_code,
        account_number=account_number,
        iban=iban,
        swift_code=swift_code,
        client_email=cl.email if cl else None,
        client_phone=cl.phone if cl else None,
        client_address=cl.address if cl else None,
        client_contact_person=cl.contact_person if cl else None,
        lines=lines_out,
        amount_paid=paid,
        balance_due=round(max(0, total - paid), 2),
        payments=payments_out,
    )


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "create")),
):
    inv = invoice_service.create_invoice(db, data, current_user.id)
    inv = invoice_service.get_invoice(db, inv.id, current_user.id)
    return _serialize_invoice(inv, True, db)


@router.post("/generate", response_model=InvoiceResponse)
def generate_invoice(
    period_start: date,
    period_end: date,
    client_id: Optional[int] = None,
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "generate")),
):
    inv = invoice_service.generate_from_rota(
        db, period_start, period_end, current_user.id, client_id=client_id, site_id=site_id
    )
    inv = invoice_service.get_invoice(db, inv.id, current_user.id)
    return _serialize_invoice(inv, True, db)


@router.get("", response_model=List[InvoiceResponse])
def list_invoices(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    status_group: Optional[str] = None,
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "view")),
):
    rows = invoice_service.get_invoices(
        db,
        current_user.id,
        client_id=client_id,
        status=status,
        status_group=status_group,
        due_from=due_from,
        due_to=due_to,
        search=search,
    )
    return [_serialize_invoice(inv, False, db) for inv in rows]


@router.get("/{invoice_id}/audit", response_model=List[InvoiceAuditEntry])
def invoice_audit(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "audit_view")),
):
    raw = invoice_service.get_invoice_audit_logs(db, invoice_id, current_user.id)
    return [InvoiceAuditEntry(**r) for r in raw]


@router.get("/{invoice_id}/pdf")
def invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "pdf_download")),
):
    inv = invoice_service.get_invoice(db, invoice_id, current_user.id)
    lines = sorted(inv.lines, key=lambda x: x.id)
    admin = db.query(User).filter(User.id == inv.company.admin_id).first() if inv.company else None
    body = render_invoice_pdf(db, inv, inv.company, inv.client, list(lines), admin)
    return Response(
        content=body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{invoice_id}.pdf"'},
    )


@router.patch("/{invoice_id}", response_model=InvoiceResponse)
def patch_invoice(
    invoice_id: int,
    data: InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "edit")),
):
    inv = invoice_service.update_invoice(db, invoice_id, data, current_user.id)
    inv = invoice_service.get_invoice(db, inv.id, current_user.id)
    return _serialize_invoice(inv, True, db)


@router.put("/{invoice_id}/lines/{line_id}", response_model=InvoiceLineResponse)
def update_line(
    invoice_id: int,
    line_id: int,
    data: InvoiceLineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "line_edit")),
):
    line = invoice_service.update_invoice_line(db, invoice_id, line_id, data, current_user.id)
    db.refresh(line)
    site = line.site
    g = line.guard
    return InvoiceLineResponse(
        id=line.id,
        invoice_id=line.invoice_id,
        site_id=line.site_id,
        guard_id=line.guard_id,
        hours=line.hours,
        rate=line.rate,
        amount=line.amount,
        allowance_amount=line.allowance_amount,
        created_at=line.created_at,
        site_name=site.name if site else None,
        guard_name=g.full_name if g else None,
    )


@router.delete("/{invoice_id}/lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_line(
    invoice_id: int,
    line_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "line_delete")),
):
    invoice_service.delete_invoice_line(db, invoice_id, line_id, current_user.id)


@router.post("/{invoice_id}/duplicate", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def duplicate_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "duplicate")),
):
    inv = invoice_service.duplicate_invoice(db, invoice_id, current_user.id)
    return _serialize_invoice(inv, True, db)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "view")),
):
    inv = invoice_service.get_invoice(db, invoice_id, current_user.id)
    return _serialize_invoice(inv, True, db)


@router.patch("/{invoice_id}/status", response_model=InvoiceResponse)
def update_status(
    invoice_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "status_change")),
):
    # Moving an invoice to "sent" emails the client, so it needs the send permission on
    # top of the general status change.
    if (status or "").strip().lower() == "sent" and not user_has_permission_db(
        db, current_user, "invoices.send"
    ):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
        )
    inv = invoice_service.update_invoice_status(db, invoice_id, status, current_user.id)
    inv = invoice_service.get_invoice(db, inv.id, current_user.id)
    return _serialize_invoice(inv, True, db)


@router.post("/{invoice_id}/lines", response_model=InvoiceLineResponse, status_code=status.HTTP_201_CREATED)
def add_line(
    invoice_id: int,
    data: InvoiceLineBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "line_create")),
):
    line = invoice_service.add_invoice_line(db, invoice_id, data, current_user.id)
    db.refresh(line)
    site = line.site
    g = line.guard
    return InvoiceLineResponse(
        id=line.id,
        invoice_id=line.invoice_id,
        site_id=line.site_id,
        guard_id=line.guard_id,
        hours=line.hours,
        rate=line.rate,
        amount=line.amount,
        allowance_amount=line.allowance_amount,
        created_at=line.created_at,
        site_name=site.name if site else None,
        guard_name=g.full_name if g else None,
    )


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "delete")),
):
    invoice_service.delete_invoice(db, invoice_id, current_user.id)
    return None
