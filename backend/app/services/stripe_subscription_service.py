from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any

import stripe
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import BillingReceipt, Company, CompanySubscription, SubscriptionReceipt, User
from app.plan_config import normalize_tier, price_for_tier
from app.services import platform_settings_service, stripe_plan_service
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


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ts(v: int | None) -> datetime | None:
    if not v:
        return None
    return datetime.fromtimestamp(v, tz=timezone.utc)


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


def _company_sub(db: Session, company_id: int) -> CompanySubscription | None:
    return (
        db.query(CompanySubscription)
        .filter(CompanySubscription.company_id == company_id)
        .order_by(CompanySubscription.id.desc())
        .first()
    )


def _sync_company_subscription(db: Session, sub: Any, company: Company, user_id: int | None = None) -> CompanySubscription:
    meta = sub.metadata or {}
    tier = meta.get("tier") or company.subscription_tier
    cycle = meta.get("billing_cycle") or company.billing_cycle or "monthly"
    price_id = sub["items"]["data"][0]["price"]["id"] if sub.get("items", {}).get("data") else None
    row = (
        db.query(CompanySubscription)
        .filter(CompanySubscription.stripe_subscription_id == sub.id)
        .first()
    )
    if not row:
        row = CompanySubscription(
            company_id=company.id,
            user_id=user_id or company.admin_id,
            stripe_customer_id=sub.customer if isinstance(sub.customer, str) else sub.customer.id,
            stripe_subscription_id=sub.id,
        )
        db.add(row)
    row.stripe_price_id = price_id
    row.plan_tier = normalize_tier(tier)
    row.billing_cycle = cycle
    row.status = sub.status
    row.current_period_start = _ts(sub.current_period_start)
    row.current_period_end = _ts(sub.current_period_end)
    row.cancel_at_period_end = bool(sub.cancel_at_period_end)
    row.canceled_at = _ts(sub.canceled_at) if sub.canceled_at else None
    company.stripe_subscription_id = sub.id
    company.subscription_tier = row.plan_tier
    company.billing_cycle = row.billing_cycle
    company.subscription_status = "active" if sub.status in ("active", "trialing") else sub.status
    if row.current_period_end:
        company.subscription_end = row.current_period_end
    if row.current_period_start:
        company.subscription_start = row.current_period_start
    db.commit()
    db.refresh(row)
    return row


def create_checkout_session(
    db: Session,
    ref_id: str,
    billing_cycle: str = "monthly",
    coupon_code: str | None = None,
) -> dict[str, str]:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    receipt = receipt_by_ref(db, ref_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status == "paid":
        raise HTTPException(status_code=400, detail="Subscription already active")
    cycle = "yearly" if billing_cycle == "yearly" else "monthly"
    receipt.billing_cycle = cycle
    company = db.query(Company).filter(Company.id == receipt.company_id).first()
    user = db.query(User).filter(User.id == receipt.user_id).first()
    if not company or not user:
        raise HTTPException(status_code=404, detail="Company not found")
    customer_id = ensure_customer(db, company, user.email, user.full_name or company.name)
    price_id = stripe_plan_service.resolve_price_id(db, receipt.subscription_tier, cycle)
    params: dict[str, Any] = {
        "customer": customer_id,
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "subscription_data": {
            "metadata": {
                "receipt_ref": receipt.ref_id,
                "company_id": str(company.id),
                "tier": receipt.subscription_tier,
                "billing_cycle": cycle,
                "user_id": str(user.id),
            }
        },
        "metadata": {"receipt_ref": receipt.ref_id, "company_id": str(company.id), "billing_cycle": cycle},
        "success_url": f"{settings.frontend_url}/payment-pending?ref={receipt.ref_id}&success=1&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{settings.frontend_url}/payment-pending?ref={receipt.ref_id}&canceled=1",
    }
    discounts = []
    if cycle == "yearly":
        coupon_id = stripe_plan_service.ensure_yearly_coupon(db)
        discounts.append({"coupon": coupon_id})
    if coupon_code:
        discounts.append({"coupon": coupon_code})
    if discounts:
        params["discounts"] = discounts
    session = stripe.checkout.Session.create(**params)
    receipt.stripe_checkout_session_id = session.id
    db.commit()
    if not session.url:
        raise HTTPException(status_code=500, detail="Failed to create checkout session")
    return {"url": session.url, "session_id": session.id}


def verify_checkout_session(db: Session, session_id: str) -> dict:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
    if session.payment_status == "paid":
        _handle_checkout_completed(db, session)
    meta = session.metadata or {}
    return {
        "payment_status": session.payment_status,
        "paid": session.payment_status == "paid",
        "receipt_ref": meta.get("receipt_ref"),
    }


def _handle_checkout_completed(db: Session, session: Any) -> None:
    meta = session.metadata or {}
    ref = meta.get("receipt_ref")
    if not ref:
        return
    if session.payment_status not in ("paid", "no_payment_required"):
        return
    receipt = receipt_by_ref(db, ref)
    if not receipt:
        return
    sub_id = session.subscription
    if isinstance(sub_id, stripe.Subscription):
        sub = sub_id
    elif sub_id:
        sub = stripe.Subscription.retrieve(sub_id)
    else:
        sub = None
    if receipt.status != "paid":
        mark_receipt_paid(db, receipt.id)
    if sub:
        company = db.query(Company).filter(Company.id == receipt.company_id).first()
        if company:
            _sync_company_subscription(db, sub, company, receipt.user_id)
            receipt.stripe_subscription_id = sub.id
            db.commit()


def _receipt_number() -> str:
    return f"RCP-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"


def _create_billing_receipt(db: Session, invoice: Any, company: Company, sub_row: CompanySubscription | None) -> BillingReceipt | None:
    inv_id = invoice.id
    if db.query(BillingReceipt).filter(BillingReceipt.stripe_invoice_id == inv_id).first():
        return None
    user_id = sub_row.user_id if sub_row else company.admin_id
    period_end = None
    if invoice.lines and invoice.lines.data:
        period_end = _ts(invoice.lines.data[0].period.end)
    last4 = None
    if invoice.charge and isinstance(invoice.charge, str):
        try:
            ch = stripe.Charge.retrieve(invoice.charge)
            if ch.payment_method_details and ch.payment_method_details.card:
                last4 = ch.payment_method_details.card.last4
        except stripe.error.StripeError:
            pass
    meta = invoice.subscription_details.metadata if getattr(invoice, "subscription_details", None) else {}
    if not meta and sub_row:
        meta = {"tier": sub_row.plan_tier, "billing_cycle": sub_row.billing_cycle}
    tier = meta.get("tier") or (sub_row.plan_tier if sub_row else company.subscription_tier)
    cycle = meta.get("billing_cycle") or (sub_row.billing_cycle if sub_row else company.billing_cycle)
    num = _receipt_number()
    while db.query(BillingReceipt).filter(BillingReceipt.receipt_number == num).first():
        num = _receipt_number()
    row = BillingReceipt(
        company_id=company.id,
        user_id=user_id,
        subscription_id=sub_row.id if sub_row else None,
        stripe_invoice_id=inv_id,
        receipt_number=num,
        amount=(invoice.amount_paid or 0) / 100,
        currency=invoice.currency or "gbp",
        plan_name=f"ControlOps {normalize_tier(tier).title()}",
        billing_cycle=cycle or "monthly",
        payment_method_last4=last4,
        invoice_url=invoice.hosted_invoice_url,
        next_renewal_date=period_end,
        paid_at=_ts(invoice.status_transitions.paid_at if invoice.status_transitions else None) or _utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _send_payment_email(db: Session, company: Company, receipt: BillingReceipt) -> None:
    try:
        from app.services.email_service import send_email
        admin = db.query(User).filter(User.id == company.admin_id).first()
        if not admin:
            return
        body = (
            f"Payment received for {receipt.plan_name}.\n"
            f"Amount: £{receipt.amount:.2f}\n"
            f"Receipt: {receipt.receipt_number}\n"
        )
        if receipt.invoice_url:
            body += f"Invoice: {receipt.invoice_url}\n"
        send_email(admin.email, "Payment confirmation — ControlOps", body)
    except Exception as e:
        logger.warning("Payment email failed: %s", e)


def _handle_invoice_paid(db: Session, invoice: Any) -> None:
    sub_id = invoice.subscription
    if not sub_id:
        return
    sub = stripe.Subscription.retrieve(sub_id)
    company_id = (sub.metadata or {}).get("company_id")
    company = None
    if company_id:
        company = db.query(Company).filter(Company.id == int(company_id)).first()
    if not company:
        company = db.query(Company).filter(Company.stripe_subscription_id == sub_id).first()
    if not company:
        return
    sub_row = _sync_company_subscription(db, sub, company)
    company.subscription_status = "active"
    db.commit()
    ref = (sub.metadata or {}).get("receipt_ref")
    if ref:
        receipt = receipt_by_ref(db, ref)
        if receipt and receipt.status != "paid":
            mark_receipt_paid(db, receipt.id)
    inv = stripe.Invoice.retrieve(invoice.id, expand=["charge"])
    billing_receipt = _create_billing_receipt(db, inv, company, sub_row)
    if billing_receipt:
        _send_payment_email(db, company, billing_receipt)


def _handle_invoice_failed(db: Session, invoice: Any) -> None:
    sub_id = invoice.subscription
    if not sub_id:
        return
    company = db.query(Company).filter(Company.stripe_subscription_id == sub_id).first()
    if not company:
        sub = stripe.Subscription.retrieve(sub_id)
        cid = (sub.metadata or {}).get("company_id")
        if cid:
            company = db.query(Company).filter(Company.id == int(cid)).first()
    if not company:
        return
    company.subscription_status = "past_due"
    sub_row = _company_sub(db, company.id)
    if sub_row:
        sub_row.status = "past_due"
    db.commit()
    retries = platform_settings_service.get_billing_settings(db)["payment_failed_lock_retries"]
    attempt = invoice.attempt_count or 0
    if attempt >= retries:
        company.subscription_status = "locked"
        db.commit()


def _handle_subscription_updated(db: Session, sub: Any) -> None:
    company_id = (sub.metadata or {}).get("company_id")
    company = None
    if company_id:
        company = db.query(Company).filter(Company.id == int(company_id)).first()
    if not company:
        company = db.query(Company).filter(Company.stripe_subscription_id == sub.id).first()
    if not company:
        return
    row = _sync_company_subscription(db, sub, company)
    if sub.status in ("active", "trialing"):
        company.subscription_status = "active"
    elif sub.status == "past_due":
        company.subscription_status = "past_due"
    elif sub.cancel_at_period_end and sub.status == "active":
        company.subscription_status = "active"
    db.commit()


def _handle_subscription_deleted(db: Session, sub: Any) -> None:
    company_id = (sub.metadata or {}).get("company_id")
    company = None
    if company_id:
        company = db.query(Company).filter(Company.id == int(company_id)).first()
    if not company:
        company = db.query(Company).filter(Company.stripe_subscription_id == sub.id).first()
    if not company:
        return
    row = _company_sub(db, company.id)
    if row:
        row.status = "canceled"
        row.canceled_at = _utcnow()
    end = _ts(sub.current_period_end)
    if end and end > _utcnow():
        company.subscription_status = "canceled"
        company.subscription_end = end
    else:
        company.subscription_status = "cancelled"
        company.subscription_end = end or _utcnow()
    db.commit()


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
        raise HTTPException(status_code=400, detail="Invalid signature") from e
    obj = event.data.object
    et = event.type
    if et == "checkout.session.completed":
        _handle_checkout_completed(db, obj)
    elif et in ("invoice.paid", "invoice.payment_succeeded"):
        _handle_invoice_paid(db, obj)
    elif et == "invoice.payment_failed":
        _handle_invoice_failed(db, obj)
    elif et == "customer.subscription.updated":
        _handle_subscription_updated(db, obj)
    elif et == "customer.subscription.deleted":
        _handle_subscription_deleted(db, obj)


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
    return {"url": session.url}


def preview_plan_change(db: Session, user: User, tier: str, billing_cycle: str) -> dict:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company or not company.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription")
    sub = stripe.Subscription.retrieve(company.stripe_subscription_id)
    item_id = sub["items"]["data"][0]["id"]
    price_id = stripe_plan_service.resolve_price_id(db, tier, billing_cycle)
    preview = stripe.Invoice.create_preview(
        customer=company.stripe_customer_id,
        subscription=company.stripe_subscription_id,
        subscription_details={
            "items": [{"id": item_id, "price": price_id}],
            "proration_behavior": "create_prorations",
        },
    )
    return {
        "amount_due": (preview.amount_due or 0) / 100,
        "currency": preview.currency,
        "tier": normalize_tier(tier),
        "billing_cycle": billing_cycle,
    }


def change_plan(
    db: Session,
    user: User,
    tier: str,
    billing_cycle: str,
    proration_behavior: str = "create_prorations",
) -> dict:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company or not company.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription")
    sub = stripe.Subscription.retrieve(company.stripe_subscription_id)
    item_id = sub["items"]["data"][0]["id"]
    price_id = stripe_plan_service.resolve_price_id(db, tier, billing_cycle)
    is_downgrade = price_for_tier(tier) < price_for_tier(company.subscription_tier)
    behavior = "none" if is_downgrade and proration_behavior != "create_prorations" else proration_behavior
    updated = stripe.Subscription.modify(
        company.stripe_subscription_id,
        items=[{"id": item_id, "price": price_id}],
        proration_behavior=behavior,
        metadata={
            **(sub.metadata or {}),
            "tier": normalize_tier(tier),
            "billing_cycle": billing_cycle,
            "company_id": str(company.id),
        },
    )
    _sync_company_subscription(db, updated, company, user.id)
    from app.services.module_service import apply_plan_module_flags
    apply_plan_module_flags(company, normalize_tier(tier))
    db.commit()
    return {"status": updated.status, "tier": normalize_tier(tier), "billing_cycle": billing_cycle}


def cancel_subscription(db: Session, user: User) -> dict:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company or not company.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription")
    sub = stripe.Subscription.modify(company.stripe_subscription_id, cancel_at_period_end=True)
    row = _company_sub(db, company.id)
    if row:
        row.cancel_at_period_end = True
        row.canceled_at = _utcnow()
        db.commit()
    return {"cancel_at_period_end": True, "current_period_end": _ts(sub.current_period_end)}


def reactivate_subscription(db: Session, user: User) -> dict:
    if not _configure():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company or not company.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No subscription")
    sub = stripe.Subscription.modify(company.stripe_subscription_id, cancel_at_period_end=False)
    row = _company_sub(db, company.id)
    if row:
        row.cancel_at_period_end = False
        row.canceled_at = None
        db.commit()
    return {"cancel_at_period_end": False, "status": sub.status}


def list_billing_receipts(db: Session, user: User) -> list[BillingReceipt]:
    if not user.company_id:
        return []
    return (
        db.query(BillingReceipt)
        .filter(BillingReceipt.company_id == user.company_id)
        .order_by(BillingReceipt.paid_at.desc())
        .all()
    )


def get_billing_receipt(db: Session, user: User, receipt_id: int) -> BillingReceipt:
    row = (
        db.query(BillingReceipt)
        .filter(BillingReceipt.id == receipt_id, BillingReceipt.company_id == user.company_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return row


def billing_receipt_out(r: BillingReceipt) -> dict:
    return {
        "id": r.id,
        "receipt_number": r.receipt_number,
        "amount": r.amount,
        "currency": r.currency,
        "plan_name": r.plan_name,
        "billing_cycle": r.billing_cycle,
        "payment_method_last4": r.payment_method_last4,
        "invoice_url": r.invoice_url,
        "next_renewal_date": r.next_renewal_date.isoformat() if r.next_renewal_date else None,
        "paid_at": r.paid_at.isoformat() if r.paid_at else None,
    }


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
