import re

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Company, User
from app.auth import get_current_user
from app.rbac import require_module
from app.services import stripe_subscription_service as stripe_svc

router = APIRouter(prefix="/stripe", tags=["stripe"])

_CHECKOUT_SESSION_ID = re.compile(r"cs_[A-Za-z0-9_]{10,255}")


class CheckoutRequest(BaseModel):
    ref_id: str
    billing_cycle: str = "monthly"
    coupon: str | None = None


class PlanChangeRequest(BaseModel):
    tier: str
    billing_cycle: str = "monthly"
    proration_behavior: str = "create_prorations"


class ConnectOnboardRequest(BaseModel):
    return_url: str
    refresh_url: str


@router.get("/config")
def stripe_config(db: Session = Depends(get_db)):
    from app.services import platform_settings_service
    billing = platform_settings_service.get_billing_settings(db)
    return {
        "enabled": stripe_svc.is_enabled(),
        "publishable_key": stripe_svc.publishable_key(),
        "yearly_discount_percent": billing["yearly_discount_percent"],
    }


@router.post("/checkout-session")
def checkout_session(body: CheckoutRequest, db: Session = Depends(get_db)):
    return stripe_svc.create_checkout_session(db, body.ref_id.strip(), body.billing_cycle, body.coupon)


@router.get("/session-status")
def session_status(session_id: str, db: Session = Depends(get_db)):
    # Necessarily unauthenticated: this is polled on return from Stripe Checkout during
    # signup, before the account exists to log into. The Checkout session id is the
    # capability, so reject anything that is not one rather than forwarding arbitrary
    # object ids to Stripe, and return only payment status + our own receipt ref.
    session_id = (session_id or "").strip()
    if not session_id or not _CHECKOUT_SESSION_ID.fullmatch(session_id):
        raise HTTPException(status_code=400, detail="session_id required")
    return stripe_svc.verify_checkout_session(db, session_id)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: str | None = Header(None, alias="stripe-signature"),
):
    payload = await request.body()
    stripe_svc.handle_webhook(db, payload, stripe_signature)
    return {"received": True}


@router.post("/portal")
def billing_portal(db: Session = Depends(get_db), current_user: User = Depends(require_module("billing", "stripe_portal"))):
    return stripe_svc.create_billing_portal(db, current_user)


@router.post("/preview-change")
def preview_change(body: PlanChangeRequest, db: Session = Depends(get_db), current_user: User = Depends(require_module("billing", "view"))):
    return stripe_svc.preview_plan_change(db, current_user, body.tier, body.billing_cycle)


@router.post("/change-plan")
def change_plan(body: PlanChangeRequest, db: Session = Depends(get_db), current_user: User = Depends(require_module("billing", "change_plan"))):
    return stripe_svc.change_plan(db, current_user, body.tier, body.billing_cycle, body.proration_behavior)


@router.post("/cancel")
def cancel_sub(db: Session = Depends(get_db), current_user: User = Depends(require_module("billing", "cancel"))):
    return stripe_svc.cancel_subscription(db, current_user)


@router.post("/reactivate")
def reactivate_sub(db: Session = Depends(get_db), current_user: User = Depends(require_module("billing", "reactivate"))):
    return stripe_svc.reactivate_subscription(db, current_user)


@router.post("/connect/account")
def connect_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("billing", "connect_account")),
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="No company")
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"account_id": stripe_svc.create_connect_account(db, company, current_user.email)}


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
    account_id = company.stripe_connect_account_id or stripe_svc.create_connect_account(db, company, current_user.email)
    url = stripe_svc.create_connect_onboarding_link(account_id, body.return_url, body.refresh_url)
    return {"url": url}
