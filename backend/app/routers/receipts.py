from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Company, SubscriptionReceipt
from app.schemas import ReceiptPublicResponse, SubscriptionReceiptResponse
from app.services.receipt_service import receipt_by_ref

router = APIRouter(prefix="/receipts", tags=["receipts"])


def _receipt_out(db: Session, r: SubscriptionReceipt) -> SubscriptionReceiptResponse:
    co = db.query(Company).filter(Company.id == r.company_id).first()
    u = r.user
    return SubscriptionReceiptResponse(
        id=r.id,
        ref_id=r.ref_id,
        company_id=r.company_id,
        company_name=co.name if co else None,
        user_email=u.email if u else None,
        subscription_tier=r.subscription_tier,
        amount=r.amount,
        period_days=r.period_days,
        status=r.status,
        period_start=r.period_start,
        period_end=r.period_end,
        paid_at=r.paid_at,
        created_at=r.created_at,
    )


@router.get("/public/{ref_id}", response_model=ReceiptPublicResponse)
def get_public_receipt(ref_id: str, db: Session = Depends(get_db)):
    r = receipt_by_ref(db, ref_id)
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    co = db.query(Company).filter(Company.id == r.company_id).first()
    return ReceiptPublicResponse(
        ref_id=r.ref_id,
        company_name=co.name if co else "",
        subscription_tier=r.subscription_tier,
        amount=r.amount,
        period_days=r.period_days,
        billing_cycle=r.billing_cycle or "monthly",
        status=r.status,
        created_at=r.created_at,
    )
