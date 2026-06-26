from __future__ import annotations

import logging
from typing import Any

import stripe
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Company, SubscriptionReceipt, User
from app.services.receipt_service import mark_receipt_paid, receipt_by_ref

logger = logging.getLogger(__name__)


def _configure() -> bool:
    if not settings.stripe_secret_key:
        return False
    stripe.api_key = settings.stripe_secret_key
    return True


def is_enabled() -> bool:
    return bool(settings.stripe_secret_key and settings.stripe_publishable_key)


def publishable_key() -> str:
    return settings.stripe_publishable_key or ""


def ensure_customer(db: Session, company: Company, email: str, name: str | None = None) -> str:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    if company.stripe_customer_id:
        return company.stripe_customer_id
    customer = stripe.Customer.create(
        email=email,
        name=name or company.name,
        metadata={"company_id": str(company.id)},
    )
    company.stripe_customer_id = customer.id
    db.commit()
    return customer.id


def _tier_interval(receipt: SubscriptionReceipt) -> str:
    days = receipt.period_days or 30
    return "year" if days >= 365 else "month"


def create_checkout_session(db: Session, ref_id: str) -> dict[str, str]:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    receipt = receipt_by_ref(db, ref_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status == "paid":
        raise HTTPException(status_code=400, detail="Subscription already active")
    company = db.query(Company).filter(Company.id == receipt.company_id).first()
    user = db.query(User).filter(User.id == receipt.user_id).first()
    if not company or not user:
        raise HTTPException(status_code=404, detail="Company not found")
    customer_id = ensure_customer(db, company, user.email, user.full_name or company.name)
    amount = int(round(float(receipt.amount) * 100))
    if amount < 1:
        raise HTTPException(status_code=400, detail="Invalid subscription amount")
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[
            {
                "price_data": {
                    "currency": "gbp",
                    "product_data": {"name": f"ControlOps {receipt.subscription_tier.title()} Plan"},
                    "unit_amount": amount,
                    "recurring": {"interval": _tier_interval(receipt)},
                },
                "quantity": 1,
            }
        ],
        subscription_data={
            "metadata": {
                "receipt_ref": receipt.ref_id,
                "company_id": str(company.id),
                "tier": receipt.subscription_tier,
            }
        },
        metadata={"receipt_ref": receipt.ref_id, "company_id": str(company.id)},
        success_url=f"{settings.frontend_url}/payment-pending?ref={receipt.ref_id}&success=1&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.frontend_url}/payment-pending?ref={receipt.ref_id}&canceled=1",
    )
    receipt.stripe_checkout_session_id = session.id
    db.commit()
    if not session.url:
        raise HTTPException(status_code=500, detail="Failed to create checkout session")
    return {"url": session.url, "session_id": session.id}


def _activate_receipt(db: Session, receipt: SubscriptionReceipt, subscription_id: str | None = None) -> None:
    if receipt.status == "paid":
        if subscription_id:
            receipt.stripe_subscription_id = subscription_id
            company = db.query(Company).filter(Company.id == receipt.company_id).first()
            if company and not company.stripe_subscription_id:
                company.stripe_subscription_id = subscription_id
                db.commit()
        return
    mark_receipt_paid(db, receipt.id)
    receipt = db.query(SubscriptionReceipt).filter(SubscriptionReceipt.id == receipt.id).first()
    if not receipt:
        return
    if subscription_id:
        receipt.stripe_subscription_id = subscription_id
        company = db.query(Company).filter(Company.id == receipt.company_id).first()
        if company:
            company.stripe_subscription_id = subscription_id
        db.commit()


def activate_from_session(db: Session, session: Any) -> None:
    meta = getattr(session, "metadata", None) or session.get("metadata") or {}
    ref = meta.get("receipt_ref")
    if not ref:
        return
    status = getattr(session, "payment_status", None) or session.get("payment_status")
    if status not in ("paid", "no_payment_required"):
        return
    receipt = receipt_by_ref(db, ref)
    if not receipt:
        return
    sub_id = getattr(session, "subscription", None) or session.get("subscription")
    if isinstance(sub_id, dict):
        sub_id = sub_id.get("id")
    _activate_receipt(db, receipt, sub_id)


def verify_checkout_session(db: Session, session_id: str) -> dict:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    session = stripe.checkout.Session.retrieve(session_id)
    if session.payment_status == "paid":
        activate_from_session(db, session)
    meta = session.metadata or {}
    return {
        "payment_status": session.payment_status,
        "paid": session.payment_status == "paid",
        "receipt_ref": meta.get("receipt_ref"),
    }


def create_billing_portal(db: Session, user: User) -> dict[str, str]:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    if not user.company_id:
        raise HTTPException(status_code=400, detail="No company")
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company or not company.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account")
    session = stripe.billing_portal.Session.create(
        customer=company.stripe_customer_id,
        return_url=f"{settings.frontend_url}/settings/company",
    )
    if not session.url:
        raise HTTPException(status_code=500, detail="Failed to create portal session")
    return {"url": session.url}


def create_connect_account(db: Session, company: Company, email: str) -> str:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    if company.stripe_connect_account_id:
        return company.stripe_connect_account_id
    account = stripe.Account.create(
        type="express",
        email=email,
        capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
        metadata={"company_id": str(company.id)},
    )
    company.stripe_connect_account_id = account.id
    db.commit()
    return account.id


def create_connect_onboarding_link(account_id: str, return_url: str, refresh_url: str) -> str:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    link = stripe.AccountLink.create(
        account=account_id,
        refresh_url=refresh_url,
        return_url=return_url,
        type="account_onboarding",
    )
    if not link.url:
        raise HTTPException(status_code=500, detail="Failed to create onboarding link")
    return link.url


def handle_webhook(db: Session, payload: bytes, sig_header: str | None) -> None:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")
    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except stripe.SignatureVerificationError as e:
        logger.warning("Stripe webhook signature failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid signature") from e

    obj = event.data.object
    if event.type == "checkout.session.completed":
        activate_from_session(db, obj)
    elif event.type == "invoice.paid":
        sub = obj.get("subscription") if isinstance(obj, dict) else getattr(obj, "subscription", None)
        if sub:
            _sync_subscription_paid(db, sub if isinstance(sub, str) else sub.get("id"))
    elif event.type == "customer.subscription.deleted":
        sub_id = obj.get("id") if isinstance(obj, dict) else getattr(obj, "id", None)
        meta = obj.get("metadata") if isinstance(obj, dict) else getattr(obj, "metadata", None) or {}
        _deactivate_subscription(db, sub_id, meta)
    elif event.type == "invoice.payment_failed":
        meta = obj.get("metadata") if isinstance(obj, dict) else getattr(obj, "metadata", None) or {}
        company_id = meta.get("company_id")
        if company_id:
            company = db.query(Company).filter(Company.id == int(company_id)).first()
            if company:
                company.subscription_status = "past_due"
                db.commit()


def _sync_subscription_paid(db: Session, subscription_id: str | None) -> None:
    if not subscription_id or not _configure():
        return
    sub = stripe.Subscription.retrieve(subscription_id)
    meta = sub.metadata or {}
    ref = meta.get("receipt_ref")
    if ref:
        receipt = receipt_by_ref(db, ref)
        if receipt:
            _activate_receipt(db, receipt, subscription_id)


def _deactivate_subscription(db: Session, subscription_id: str | None, metadata: dict) -> None:
    company_id = metadata.get("company_id")
    if company_id:
        company = db.query(Company).filter(Company.id == int(company_id)).first()
    elif subscription_id:
        company = db.query(Company).filter(Company.stripe_subscription_id == subscription_id).first()
    else:
        company = None
    if company:
        company.subscription_status = "cancelled"
        db.commit()
