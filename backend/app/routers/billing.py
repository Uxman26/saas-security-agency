from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Company, User
from app.rbac import require_internal_module
from app.services import stripe_subscription_service as stripe_svc
from app.services import subscription_invoice_service as sub_inv

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/receipts")
def list_receipts(db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "view"))):
    rows = stripe_svc.list_billing_receipts(db, current_user)
    return [stripe_svc.billing_receipt_out(r) for r in rows]


@router.get("/receipts/{receipt_id}")
def get_receipt(receipt_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "view"))):
    row = stripe_svc.get_billing_receipt(db, current_user, receipt_id)
    return stripe_svc.billing_receipt_out(row)


@router.get("/receipts/{receipt_id}/pdf")
def receipt_pdf(receipt_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "view"))):
    row = stripe_svc.get_billing_receipt(db, current_user, receipt_id)
    company = db.query(Company).filter(Company.id == row.company_id).first()
    body = stripe_svc.render_billing_receipt_pdf(row, company)
    name = (row.receipt_number or f"receipt-{receipt_id}").replace('"', "")
    return Response(
        content=body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'},
    )


@router.get("/invoices")
def list_invoices(db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "view"))):
    if not current_user.company_id:
        return []
    return sub_inv.list_invoices(db, company_id=current_user.company_id)


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "view"))):
    return sub_inv.get_invoice_for_company(db, invoice_id, current_user.company_id)


@router.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "view"))):
    inv = sub_inv.load_company_invoice(db, invoice_id, current_user.company_id)
    body = sub_inv.render_subscription_invoice_pdf(inv, inv.company)
    name = (inv.invoice_number or f"invoice-{invoice_id}").replace('"', "")
    return Response(
        content=body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'},
    )
