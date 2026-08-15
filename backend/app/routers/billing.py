from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module
from app.services import stripe_subscription_service as stripe_svc

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/receipts")
def list_receipts(db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "receipts_view"))):
    rows = stripe_svc.list_billing_receipts(db, current_user)
    return [stripe_svc.billing_receipt_out(r) for r in rows]


@router.get("/receipts/{receipt_id}")
def get_receipt(receipt_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "receipts_view"))):
    row = stripe_svc.get_billing_receipt(db, current_user, receipt_id)
    return stripe_svc.billing_receipt_out(row)
