from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Company, User
from app.auth import get_current_user
from app.rbac import PERM_SUB_READ, require_perm
from app.services import stripe_service

router = APIRouter(prefix="/stripe", tags=["stripe"])


class CheckoutRequest(BaseModel):
    ref_id: str


class ConnectOnboardRequest(BaseModel):
    return_url: str
    refresh_url: str


@router.get("/config")
def stripe_config():
    return {
        "enabled": stripe_service.is_enabled(),
        "publishable_key": stripe_service.publishable_key(),
    }


@router.post("/checkout-session")
def checkout_session(body: CheckoutRequest, db: Session = Depends(get_db)):
    return stripe_service.create_checkout_session(db, body.ref_id.strip())


@router.get("/session-status")
def session_status(session_id: str, db: Session = Depends(get_db)):
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    return stripe_service.verify_checkout_session(db, session_id)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: str | None = Header(None, alias="stripe-signature"),
):
    payload = await request.body()
    stripe_service.handle_webhook(db, payload, stripe_signature)
    return {"received": True}


@router.post("/portal")
def billing_portal(db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_SUB_READ))):
    return stripe_service.create_billing_portal(db, current_user)


@router.post("/connect/account")
def connect_account(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="No company")
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    account_id = stripe_service.create_connect_account(db, company, current_user.email)
    return {"account_id": account_id}


@router.post("/connect/onboard")
def connect_onboard(
    body: ConnectOnboardRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="No company")
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    account_id = company.stripe_connect_account_id or stripe_service.create_connect_account(
        db, company, current_user.email
    )
    url = stripe_service.create_connect_onboarding_link(account_id, body.return_url, body.refresh_url)
    return {"url": url}
