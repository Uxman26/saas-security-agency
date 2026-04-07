from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.models import User, Invoice, InvoiceLine
from app.schemas import (
    InvoiceCreate,
    InvoiceResponse,
    InvoiceLineBase,
    InvoiceLineResponse,
    InvoiceUpdate,
    InvoiceLineUpdate,
    InvoiceAuditEntry,
)
from app.rbac import require_perm, PERM_INV_READ, PERM_INV_WRITE, PERM_INV_DELETE
from app.services import invoice_service
from app.services.invoice_pdf import render_invoice_pdf

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _serialize_invoice(inv: Invoice, include_lines: bool) -> InvoiceResponse:
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
        client_name=inv.client.name if inv.client else None,
        company_name=inv.company.name if inv.company else None,
        lines=lines_out,
    )


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_INV_WRITE)),
):
    inv = invoice_service.create_invoice(db, data, current_user.id)
    inv = invoice_service.get_invoice(db, inv.id, current_user.id)
    return _serialize_invoice(inv, True)


@router.post("/generate", response_model=InvoiceResponse)
def generate_invoice(
    client_id: int,
    period_start: date,
    period_end: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_INV_WRITE)),
):
    inv = invoice_service.generate_from_assignments(db, client_id, period_start, period_end, current_user.id)
    inv = invoice_service.get_invoice(db, inv.id, current_user.id)
    return _serialize_invoice(inv, True)


@router.get("", response_model=List[InvoiceResponse])
def list_invoices(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_INV_READ)),
):
    rows = invoice_service.get_invoices(db, current_user.id, client_id, status)
    return [_serialize_invoice(inv, False) for inv in rows]


@router.get("/{invoice_id}/audit", response_model=List[InvoiceAuditEntry])
def invoice_audit(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_INV_READ)),
):
    raw = invoice_service.get_invoice_audit_logs(db, invoice_id, current_user.id)
    return [InvoiceAuditEntry(**r) for r in raw]


@router.get("/{invoice_id}/pdf")
def invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_INV_READ)),
):
    inv = invoice_service.get_invoice(db, invoice_id, current_user.id)
    lines = sorted(inv.lines, key=lambda x: x.id)
    body = render_invoice_pdf(db, inv, inv.company, inv.client, list(lines))
    return Response(
        content=body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="invoice-{invoice_id}.pdf"'},
    )


@router.patch("/{invoice_id}", response_model=InvoiceResponse)
def patch_invoice(
    invoice_id: int,
    data: InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_INV_WRITE)),
):
    inv = invoice_service.update_invoice(db, invoice_id, data, current_user.id)
    inv = invoice_service.get_invoice(db, inv.id, current_user.id)
    return _serialize_invoice(inv, True)


@router.put("/{invoice_id}/lines/{line_id}", response_model=InvoiceLineResponse)
def update_line(
    invoice_id: int,
    line_id: int,
    data: InvoiceLineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_INV_WRITE)),
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
    current_user: User = Depends(require_perm(PERM_INV_WRITE)),
):
    invoice_service.delete_invoice_line(db, invoice_id, line_id, current_user.id)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_INV_READ)),
):
    inv = invoice_service.get_invoice(db, invoice_id, current_user.id)
    return _serialize_invoice(inv, True)


@router.patch("/{invoice_id}/status", response_model=InvoiceResponse)
def update_status(
    invoice_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_INV_WRITE)),
):
    inv = invoice_service.update_invoice_status(db, invoice_id, status, current_user.id)
    inv = invoice_service.get_invoice(db, inv.id, current_user.id)
    return _serialize_invoice(inv, True)


@router.post("/{invoice_id}/lines", response_model=InvoiceLineResponse, status_code=status.HTTP_201_CREATED)
def add_line(
    invoice_id: int,
    data: InvoiceLineBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_INV_WRITE)),
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
    current_user: User = Depends(require_perm(PERM_INV_DELETE)),
):
    invoice_service.delete_invoice(db, invoice_id, current_user.id)
    return None
