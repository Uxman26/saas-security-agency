from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi import status as http_status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.models import User, Invoice, InvoiceLine, Payment, CreditNote
from app.schemas import (
    InvoiceCreate,
    InvoiceResponse,
    InvoiceLineBase,
    InvoiceLineResponse,
    InvoiceUpdate,
    InvoiceLineUpdate,
    InvoiceAuditEntry,
    InvoiceStatementResponse,
    PaymentResponse,
    CreditNoteResponse,
)
from app.rbac import require_module, require_internal_module, user_has_permission_db
from app.services import invoice_service
from app.services.invoice_pdf import render_invoice_pdf
from app.services.invoice_statement_service import build_statement
from app.services.invoice_statement_pdf import render_statement_pdf
from app.services.invoice_payment_service import invoice_amount_paid, invoice_credit_applied, invoice_balance_due
from app.services.company_profile_service import company_logo_url

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _site_stand_in_name(inv: Invoice, db: Session | None = None) -> Optional[str]:
    """The site an invoice with no client is billed against, by name.

    List responses load with noload(Invoice.lines), so fall back to a direct lookup —
    otherwise the Customer column would be blank for every client-less invoice.
    """
    for ln in sorted(inv.lines, key=lambda x: x.id):
        site = getattr(ln, "site", None)
        if site and site.name:
            return site.name
    if db is not None:
        from app.models import Site

        row = (
            db.query(Site.name)
            .join(InvoiceLine, InvoiceLine.site_id == Site.id)
            .filter(InvoiceLine.invoice_id == inv.id)
            .order_by(InvoiceLine.id)
            .first()
        )
        if row:
            return row[0]
    return None


def _shift_timing(ln: InvoiceLine) -> Optional[str]:
    start = (ln.shift_start or "").strip()
    end = (ln.shift_end or "").strip()
    if start and end:
        return f"{start} - {end}"
    if start or end:
        return start or end
    return None


def _serialize_invoice(inv: Invoice, include_lines: bool, db: Session | None = None) -> InvoiceResponse:
    lines_out: list[InvoiceLineResponse] = []
    if include_lines:
        for ln in sorted(inv.lines, key=lambda x: (x.shift_date is None, x.shift_date or date.min, x.id)):
            site = getattr(ln, "site", None)
            g = getattr(ln, "guard", None)
            lines_out.append(
                InvoiceLineResponse(
                    id=ln.id,
                    invoice_id=ln.invoice_id,
                    site_id=ln.site_id,
                    shift_date=ln.shift_date,
                    shift_start=ln.shift_start,
                    shift_end=ln.shift_end,
                    description=ln.description,
                    service_detail=ln.service_detail,
                    quantity=ln.quantity if ln.quantity is not None else 1,
                    guard_id=ln.guard_id,
                    hours=ln.hours,
                    rate=ln.rate,
                    amount=ln.amount,
                    allowance_amount=ln.allowance_amount,
                    created_at=ln.created_at,
                    site_name=site.name if site else None,
                    guard_name=g.full_name if g else None,
                    shift_timing=_shift_timing(ln),
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
    company_website = None
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
        company_website = co.website
        company_registration_number = co.registration_number
        company_vat_number = co.vat_number
        company_logo_url_val = company_logo_url(co)
        account_name = inv.payee_account_name or co.account_name
        bank_name = inv.payee_bank_name or co.bank_name
        sort_code = inv.payee_sort_code or co.sort_code
        account_number = inv.payee_account_number or co.account_number
        iban = inv.payee_iban or co.iban
        swift_code = inv.payee_swift_code or co.swift_code
    paid = invoice_amount_paid(db, inv.id) if db else 0
    credited = invoice_credit_applied(db, inv.id) if db else 0
    payments_out = []
    credit_notes_out = []
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
        for cn in (
            db.query(CreditNote)
            .filter(CreditNote.invoice_id == inv.id)
            .order_by(CreditNote.credit_date.desc(), CreditNote.id.desc())
            .all()
        ):
            credit_notes_out.append(
                CreditNoteResponse(
                    id=cn.id,
                    company_id=cn.company_id,
                    invoice_id=cn.invoice_id,
                    client_id=cn.client_id,
                    site_id=cn.site_id,
                    number=cn.number,
                    credit_date=cn.credit_date,
                    reason=cn.reason,
                    description=cn.description,
                    subtotal=cn.subtotal or 0,
                    tax_rate=cn.tax_rate or 0,
                    tax_amount=cn.tax_amount or 0,
                    total=cn.total or 0,
                    status=cn.status,
                    created_at=cn.created_at,
                    updated_at=cn.updated_at,
                    invoice_number=f"INV-{cn.invoice_id}",
                    client_name=cl.name if cl else None,
                    site_name=cn.site.name if getattr(cn, "site", None) else None,
                )
            )
    total = float(inv.total or 0)
    balance = invoice_balance_due(db, inv) if db else round(max(0, total - paid - credited), 2)
    return InvoiceResponse(
        id=inv.id,
        company_id=inv.company_id,
        client_id=inv.client_id,
        period_start=inv.period_start,
        period_end=inv.period_end,
        invoice_date=inv.invoice_date or (inv.created_at.date() if inv.created_at else None),
        total=inv.total,
        status=inv.status,
        due_date=inv.due_date,
        po_number=inv.po_number,
        notes=inv.notes,
        rota_review=inv.rota_review,
        client_bank_account_id=inv.client_bank_account_id,
        tax_rate=inv.tax_rate or 0,
        subtotal=inv.subtotal or 0,
        tax_amount=inv.tax_amount or 0,
        pdf_path=inv.pdf_path,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
        client_name=cl.name if cl else _site_stand_in_name(inv, db),
        company_name=co.name if co else None,
        company_email=company_email,
        company_phone=company_phone,
        company_address=company_address,
        company_website=company_website,
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
        credit_applied=credited,
        balance_due=balance,
        payments=payments_out,
        credit_notes=credit_notes_out,
        column_headers=_column_headers(inv),
    )


def _column_headers(inv: Invoice) -> dict | None:
    raw = getattr(inv, "column_headers_json", None)
    if not raw:
        return None
    try:
        import json
        data = json.loads(raw) if isinstance(raw, str) else raw
        return data if isinstance(data, dict) else None
    except Exception:
        return None


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "create")),
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
    contractor_id: Optional[str] = None,
    sub_contractor_id: Optional[str] = None,
    guard_id: Optional[int] = None,
    job_title: Optional[str] = None,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "generate")),
):
    """Generate from published rota shifts. By client this covers all of the client's
    sites; the contractor, sub-contractor, staff and job title filters narrow it."""
    inv = invoice_service.generate_from_rota(
        db,
        period_start,
        period_end,
        current_user.id,
        client_id=client_id,
        site_id=site_id,
        contractor_id=contractor_id,
        sub_contractor_id=sub_contractor_id,
        guard_id=guard_id,
        job_title=job_title,
        force=force,
    )
    inv = invoice_service.get_invoice(db, inv.id, current_user.id)
    return _serialize_invoice(inv, True, db)


@router.get("/statement", response_model=InvoiceStatementResponse)
def get_statement(
    date_from: date,
    date_to: date,
    client_id: Optional[int] = None,
    site_id: Optional[int] = None,
    statement_type: str = "all",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "view")),
):
    return build_statement(
        db,
        current_user.id,
        client_id=client_id,
        site_id=site_id,
        date_from=date_from,
        date_to=date_to,
        statement_type=statement_type,
    )


@router.get("/statement/pdf")
def statement_pdf(
    date_from: date,
    date_to: date,
    client_id: Optional[int] = None,
    site_id: Optional[int] = None,
    statement_type: str = "all",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "pdf_download")),
):
    data = build_statement(
        db,
        current_user.id,
        client_id=client_id,
        site_id=site_id,
        date_from=date_from,
        date_to=date_to,
        statement_type=statement_type,
    )
    body = render_statement_pdf(data)
    name = f"statement-{statement_type}-{site_id or client_id}-{date_from}-{date_to}.pdf"
    return Response(
        content=body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("", response_model=List[InvoiceResponse])
def list_invoices(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    status_group: Optional[str] = None,
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    search: Optional[str] = None,
    site_id: Optional[int] = None,
    contractor_id: Optional[str] = None,
    sub_contractor_id: Optional[str] = None,
    guard_id: Optional[int] = None,
    job_title: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("invoices", "view")),
):
    """Invoices matching any combination of the screen's filters. Picking a client
    already covers every site assigned to it."""
    rows = invoice_service.get_invoices(
        db,
        current_user.id,
        client_id=client_id,
        status=status,
        status_group=status_group,
        due_from=due_from,
        due_to=due_to,
        search=search,
        site_id=site_id,
        contractor_id=contractor_id,
        sub_contractor_id=sub_contractor_id,
        guard_id=guard_id,
        job_title=job_title,
    )
    return [_serialize_invoice(inv, False, db) for inv in rows]


@router.get("/{invoice_id}/audit", response_model=List[InvoiceAuditEntry])
def invoice_audit(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "audit_view")),
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
    current_user: User = Depends(require_internal_module("invoices", "edit")),
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
    current_user: User = Depends(require_internal_module("invoices", "line_edit")),
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
    current_user: User = Depends(require_internal_module("invoices", "line_delete")),
):
    invoice_service.delete_invoice_line(db, invoice_id, line_id, current_user.id)


@router.post("/{invoice_id}/duplicate", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def duplicate_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "duplicate")),
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
    current_user: User = Depends(require_internal_module("invoices", "status_change")),
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
    current_user: User = Depends(require_internal_module("invoices", "line_create")),
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
    current_user: User = Depends(require_internal_module("invoices", "delete")),
):
    invoice_service.delete_invoice(db, invoice_id, current_user.id)
    return None
