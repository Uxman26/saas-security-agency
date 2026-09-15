from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import (
    BillingReceipt,
    Company,
    PaymentRefund,
    RefundEvent,
    RefundPolicy,
    SubscriptionChange,
    SubscriptionInvoice,
    SubscriptionReceipt,
    User,
)
from app.services import platform_audit_service

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = ("pending_approval", "approved", "processing", "completed")
SCENARIOS = (
    "full",
    "partial",
    "fixed",
    "percentage",
    "cancellation",
    "no_show",
    "subscription_cancellation",
    "overpayment",
    "credit",
    "custom",
)

DEFAULT_POLICIES: list[dict[str, Any]] = [
    {
        "code": "full_refund",
        "name": "Full refund",
        "description": "Refund 100% of remaining paid amount.",
        "scenario_type": "full",
        "calculation_type": "full",
        "requires_approval": True,
        "auto_approve_below": 50.0,
        "max_refund_percent": 100.0,
        "allow_stripe": True,
        "allow_credit": True,
        "allow_manual": True,
        "default_refund_method": "stripe",
        "priority": 10,
        "eligible_payment_statuses_json": json.dumps(["paid", "partial", "active"]),
    },
    {
        "code": "partial_percentage",
        "name": "Partial percentage",
        "description": "Refund a configured percentage of paid amount.",
        "scenario_type": "percentage",
        "calculation_type": "percentage",
        "percentage": 50.0,
        "requires_approval": True,
        "auto_approve_below": 25.0,
        "max_refund_percent": 100.0,
        "default_refund_method": "stripe",
        "priority": 20,
    },
    {
        "code": "fixed_amount",
        "name": "Fixed amount",
        "description": "Refund a fixed amount (capped by remaining refundable).",
        "scenario_type": "fixed",
        "calculation_type": "fixed",
        "fixed_amount": 0.0,
        "requires_approval": True,
        "default_refund_method": "manual",
        "priority": 30,
    },
    {
        "code": "cancellation",
        "name": "Cancellation",
        "description": "Refund for service cancellation within the eligibility window.",
        "scenario_type": "cancellation",
        "calculation_type": "percentage",
        "percentage": 100.0,
        "max_days_after_payment": 14,
        "requires_approval": True,
        "default_refund_method": "stripe",
        "priority": 40,
    },
    {
        "code": "no_show",
        "name": "No-show",
        "description": "No-show policy — default 0% refund unless overridden.",
        "scenario_type": "no_show",
        "calculation_type": "percentage",
        "percentage": 0.0,
        "requires_approval": True,
        "default_refund_method": "manual",
        "priority": 50,
    },
    {
        "code": "subscription_cancellation",
        "name": "Subscription cancellation",
        "description": "Prorated-style percentage on subscription cancel.",
        "scenario_type": "subscription_cancellation",
        "calculation_type": "percentage",
        "percentage": 50.0,
        "requires_approval": True,
        "default_refund_method": "stripe",
        "priority": 60,
    },
    {
        "code": "overpayment",
        "name": "Overpayment",
        "description": "Refund overpaid amount (full remaining refundable).",
        "scenario_type": "overpayment",
        "calculation_type": "full",
        "requires_approval": False,
        "auto_approve_below": 500.0,
        "default_refund_method": "stripe",
        "priority": 70,
    },
    {
        "code": "account_credit",
        "name": "Account credit",
        "description": "Issue billing credit instead of a card refund.",
        "scenario_type": "credit",
        "calculation_type": "full",
        "requires_approval": True,
        "allow_stripe": False,
        "allow_credit": True,
        "default_refund_method": "credit",
        "priority": 80,
    },
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _round_money(v: float) -> float:
    return round(float(v or 0), 2)


def _parse_json_list(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return [str(x) for x in data] if isinstance(data, list) else []
    except Exception:
        return []


def ensure_default_policies(db: Session) -> None:
    for p in DEFAULT_POLICIES:
        row = db.query(RefundPolicy).filter(RefundPolicy.code == p["code"]).first()
        if row:
            continue
        db.add(RefundPolicy(**p))
    db.commit()


def _serialize_policy(p: RefundPolicy) -> dict:
    return {
        "id": p.id,
        "code": p.code,
        "name": p.name,
        "description": p.description,
        "scenario_type": p.scenario_type,
        "calculation_type": p.calculation_type,
        "percentage": p.percentage,
        "fixed_amount": p.fixed_amount,
        "requires_approval": bool(p.requires_approval),
        "auto_approve_below": p.auto_approve_below,
        "max_refund_percent": p.max_refund_percent,
        "max_refund_amount": p.max_refund_amount,
        "min_days_after_payment": p.min_days_after_payment,
        "max_days_after_payment": p.max_days_after_payment,
        "eligible_payment_statuses": _parse_json_list(p.eligible_payment_statuses_json),
        "allow_stripe": bool(p.allow_stripe),
        "allow_credit": bool(p.allow_credit),
        "allow_manual": bool(p.allow_manual),
        "default_refund_method": p.default_refund_method,
        "is_active": bool(p.is_active),
        "priority": p.priority,
        "updated_at": p.updated_at,
        "created_at": p.created_at,
    }


def list_policies(db: Session, active_only: bool = False) -> list[dict]:
    ensure_default_policies(db)
    q = db.query(RefundPolicy)
    if active_only:
        q = q.filter(RefundPolicy.is_active.is_(True))
    return [_serialize_policy(p) for p in q.order_by(RefundPolicy.priority, RefundPolicy.id).all()]


def get_policy(db: Session, policy_id: int) -> RefundPolicy:
    p = db.query(RefundPolicy).filter(RefundPolicy.id == policy_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Refund policy not found")
    return p


def upsert_policy(db: Session, payload: dict, actor: User, policy_id: Optional[int] = None) -> dict:
    ensure_default_policies(db)
    if policy_id:
        row = get_policy(db, policy_id)
    else:
        code = (payload.get("code") or "").strip()
        if not code:
            raise HTTPException(status_code=400, detail="Policy code required")
        existing = db.query(RefundPolicy).filter(RefundPolicy.code == code).first()
        if existing:
            raise HTTPException(status_code=400, detail="Policy code already exists")
        row = RefundPolicy(code=code, name=payload.get("name") or code, scenario_type=payload.get("scenario_type") or "custom")
        db.add(row)

    for k in (
        "name",
        "description",
        "scenario_type",
        "calculation_type",
        "percentage",
        "fixed_amount",
        "requires_approval",
        "auto_approve_below",
        "max_refund_percent",
        "max_refund_amount",
        "min_days_after_payment",
        "max_days_after_payment",
        "allow_stripe",
        "allow_credit",
        "allow_manual",
        "default_refund_method",
        "is_active",
        "priority",
    ):
        if k in payload and payload[k] is not None:
            setattr(row, k, payload[k])
    if "eligible_payment_statuses" in payload and payload["eligible_payment_statuses"] is not None:
        row.eligible_payment_statuses_json = json.dumps(payload["eligible_payment_statuses"])
    if "code" in payload and payload["code"] and not policy_id:
        row.code = payload["code"].strip()
    row.updated_by_user_id = actor.id
    db.commit()
    db.refresh(row)
    return _serialize_policy(row)


def _committed_refund_total(
    db: Session,
    *,
    company_id: int,
    subscription_invoice_id: Optional[int] = None,
    billing_receipt_id: Optional[int] = None,
    subscription_receipt_id: Optional[int] = None,
    exclude_refund_id: Optional[int] = None,
) -> float:
    q = db.query(PaymentRefund).filter(
        PaymentRefund.company_id == company_id,
        PaymentRefund.status.in_(list(ACTIVE_STATUSES)),
    )
    if subscription_invoice_id is not None:
        q = q.filter(PaymentRefund.subscription_invoice_id == subscription_invoice_id)
    if billing_receipt_id is not None:
        q = q.filter(PaymentRefund.billing_receipt_id == billing_receipt_id)
    if subscription_receipt_id is not None:
        q = q.filter(PaymentRefund.subscription_receipt_id == subscription_receipt_id)
    if exclude_refund_id is not None:
        q = q.filter(PaymentRefund.id != exclude_refund_id)
    total = 0.0
    for r in q.all():
        total += float(r.processed_amount or r.approved_amount or r.amount or 0)
    return _round_money(total)


def _resolve_payment_context(
    db: Session,
    *,
    company_id: int,
    invoice_id: Optional[int] = None,
    billing_receipt_id: Optional[int] = None,
    subscription_receipt_id: Optional[int] = None,
) -> dict[str, Any]:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    inv: Optional[SubscriptionInvoice] = None
    br: Optional[BillingReceipt] = None
    sr: Optional[SubscriptionReceipt] = None
    paid = 0.0
    currency = "gbp"
    paid_at: Optional[datetime] = None
    payment_status = "unknown"
    payment_source = "manual"
    label = None
    stripe_invoice_id = None

    if invoice_id:
        inv = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.id == invoice_id).first()
        if not inv or inv.company_id != company_id:
            raise HTTPException(status_code=404, detail="Invoice not found")
        paid = _round_money(inv.amount_paid or 0)
        payment_status = inv.status or "unknown"
        payment_source = "subscription_invoice"
        label = inv.invoice_number
        paid_at = inv.paid_at or inv.created_at
    if billing_receipt_id:
        br = db.query(BillingReceipt).filter(BillingReceipt.id == billing_receipt_id).first()
        if not br or br.company_id != company_id:
            raise HTTPException(status_code=404, detail="Billing receipt not found")
        paid = _round_money(br.amount or 0)
        currency = (br.currency or "gbp").lower()
        payment_status = "paid"
        payment_source = "billing_receipt"
        label = br.receipt_number
        paid_at = br.paid_at or br.created_at
        stripe_invoice_id = br.stripe_invoice_id
    if subscription_receipt_id:
        sr = db.query(SubscriptionReceipt).filter(SubscriptionReceipt.id == subscription_receipt_id).first()
        if not sr or sr.company_id != company_id:
            raise HTTPException(status_code=404, detail="Subscription receipt not found")
        paid = _round_money(sr.amount or 0)
        payment_status = sr.status or "unknown"
        payment_source = "subscription_receipt"
        label = sr.ref_id
        paid_at = sr.paid_at or sr.created_at

    if not inv and not br and not sr:
        raise HTTPException(status_code=400, detail="Select an invoice or receipt for the refund")

    previously = _committed_refund_total(
        db,
        company_id=company_id,
        subscription_invoice_id=invoice_id,
        billing_receipt_id=billing_receipt_id,
        subscription_receipt_id=subscription_receipt_id,
    )
    remaining = _round_money(max(0.0, paid - previously))
    return {
        "company": company,
        "invoice": inv,
        "billing_receipt": br,
        "subscription_receipt": sr,
        "paid": paid,
        "currency": currency,
        "payment_status": payment_status,
        "payment_source": payment_source,
        "label": label,
        "paid_at": paid_at,
        "stripe_invoice_id": stripe_invoice_id,
        "previously_refunded": previously,
        "remaining_refundable": remaining,
        "account_credit_balance": _round_money(getattr(company, "account_credit_balance", 0) or 0),
        "subscription_status": company.subscription_status,
        "subscription_tier": company.subscription_tier,
    }


def _days_since(paid_at: Optional[datetime]) -> Optional[int]:
    if not paid_at:
        return None
    if paid_at.tzinfo is None:
        paid_at = paid_at.replace(tzinfo=timezone.utc)
    return max(0, (_now() - paid_at).days)


def _calculate_amount(
    *,
    policy: RefundPolicy,
    remaining: float,
    requested_amount: Optional[float],
    override: bool,
) -> float:
    calc = (policy.calculation_type or "full").lower()
    amount = 0.0
    if calc == "full":
        amount = remaining
    elif calc == "percentage":
        pct = float(policy.percentage or 0)
        amount = remaining * (pct / 100.0)
    elif calc == "fixed":
        if requested_amount is not None:
            amount = float(requested_amount)
        else:
            amount = float(policy.fixed_amount or 0)
    elif calc == "remaining":
        amount = remaining
    else:
        amount = float(requested_amount or 0)

    if override and requested_amount is not None:
        amount = float(requested_amount)
    elif requested_amount is not None and calc in ("custom", "partial"):
        amount = float(requested_amount)
    elif requested_amount is not None and calc in ("percentage", "full", "remaining"):
        # Requested amount may only reduce the policy-calculated figure
        amount = min(amount, float(requested_amount))

    if policy.max_refund_percent is not None and remaining > 0 and not override:
        amount = min(amount, remaining * (float(policy.max_refund_percent) / 100.0))
    if policy.max_refund_amount is not None and not override:
        amount = min(amount, float(policy.max_refund_amount))

    amount = _round_money(min(max(0.0, amount), remaining if not override else max(remaining, amount)))
    if not override:
        amount = _round_money(min(amount, remaining))
    return amount


def _eligibility_errors(policy: RefundPolicy, ctx: dict, amount: float, override: bool) -> list[str]:
    errors: list[str] = []
    if not policy.is_active and not override:
        errors.append("Policy is inactive")
    statuses = _parse_json_list(policy.eligible_payment_statuses_json)
    if statuses and ctx["payment_status"] not in statuses and not override:
        errors.append(f"Payment status '{ctx['payment_status']}' is not eligible for this policy")
    days = _days_since(ctx.get("paid_at"))
    if days is not None:
        if policy.min_days_after_payment and days < int(policy.min_days_after_payment) and not override:
            errors.append(f"Must wait {policy.min_days_after_payment} day(s) after payment")
        if policy.max_days_after_payment is not None and days > int(policy.max_days_after_payment) and not override:
            errors.append(f"Outside refund window of {policy.max_days_after_payment} day(s)")
    if ctx["remaining_refundable"] <= 0 and not override:
        errors.append("Nothing remaining to refund (would over-refund)")
    if amount <= 0 and not override:
        errors.append("Calculated refund amount is zero")
    if amount > ctx["remaining_refundable"] + 0.001 and not override:
        errors.append("Amount exceeds remaining refundable balance")
    return errors


def preview_refund(
    db: Session,
    *,
    company_id: int,
    policy_id: Optional[int] = None,
    scenario_type: Optional[str] = None,
    invoice_id: Optional[int] = None,
    billing_receipt_id: Optional[int] = None,
    subscription_receipt_id: Optional[int] = None,
    requested_amount: Optional[float] = None,
    refund_method: Optional[str] = None,
    override: bool = False,
) -> dict:
    ensure_default_policies(db)
    ctx = _resolve_payment_context(
        db,
        company_id=company_id,
        invoice_id=invoice_id,
        billing_receipt_id=billing_receipt_id,
        subscription_receipt_id=subscription_receipt_id,
    )
    policy: Optional[RefundPolicy] = None
    if policy_id:
        policy = get_policy(db, policy_id)
    elif scenario_type:
        policy = (
            db.query(RefundPolicy)
            .filter(RefundPolicy.scenario_type == scenario_type, RefundPolicy.is_active.is_(True))
            .order_by(RefundPolicy.priority, RefundPolicy.id)
            .first()
        )
    if not policy:
        policy = (
            db.query(RefundPolicy)
            .filter(RefundPolicy.code == "full_refund")
            .first()
        ) or db.query(RefundPolicy).filter(RefundPolicy.is_active.is_(True)).order_by(RefundPolicy.priority).first()
    if not policy:
        raise HTTPException(status_code=400, detail="No refund policy available")

    amount = _calculate_amount(
        policy=policy,
        remaining=ctx["remaining_refundable"],
        requested_amount=requested_amount,
        override=override,
    )
    errors = _eligibility_errors(policy, ctx, amount, override)
    method = (refund_method or policy.default_refund_method or "manual").lower()
    if method == "stripe" and not policy.allow_stripe and not override:
        errors.append("Policy does not allow Stripe refunds")
    if method == "credit" and not policy.allow_credit and not override:
        errors.append("Policy does not allow account credits")
    if method == "manual" and not policy.allow_manual and not override:
        errors.append("Policy does not allow manual refunds")
    if method == "stripe" and not ctx.get("stripe_invoice_id") and not override:
        # Still eligible via manual/credit fallback notice
        pass

    requires_approval = bool(policy.requires_approval)
    if policy.auto_approve_below is not None and amount <= float(policy.auto_approve_below):
        requires_approval = False

    return {
        "eligible": len(errors) == 0,
        "errors": errors,
        "company_id": company_id,
        "company_name": ctx["company"].name,
        "payment_source": ctx["payment_source"],
        "payment_label": ctx["label"],
        "payment_status": ctx["payment_status"],
        "subscription_status": ctx["subscription_status"],
        "subscription_tier": ctx["subscription_tier"],
        "original_paid_amount": ctx["paid"],
        "previously_refunded_amount": ctx["previously_refunded"],
        "remaining_refundable": ctx["remaining_refundable"],
        "calculated_amount": amount,
        "currency": ctx["currency"],
        "requires_approval": requires_approval,
        "refund_method": method,
        "stripe_invoice_id": ctx.get("stripe_invoice_id"),
        "account_credit_balance": ctx["account_credit_balance"],
        "days_since_payment": _days_since(ctx.get("paid_at")),
        "policy": _serialize_policy(policy),
        "invoice_id": invoice_id,
        "billing_receipt_id": billing_receipt_id,
        "subscription_receipt_id": subscription_receipt_id,
    }


def _add_event(
    db: Session,
    refund: PaymentRefund,
    *,
    actor: Optional[User],
    action: str,
    from_status: Optional[str],
    to_status: Optional[str],
    amount: Optional[float] = None,
    note: Optional[str] = None,
    detail: Optional[dict] = None,
) -> None:
    db.add(
        RefundEvent(
            refund_id=refund.id,
            actor_user_id=actor.id if actor else None,
            action=action,
            from_status=from_status,
            to_status=to_status,
            amount=amount,
            note=note,
            detail_json=json.dumps(detail) if detail else None,
        )
    )


def _serialize_refund(r: PaymentRefund, db: Optional[Session] = None) -> dict:
    company_name = None
    policy_code = None
    if db:
        co = db.query(Company).filter(Company.id == r.company_id).first()
        company_name = co.name if co else None
        if r.policy_id:
            pol = db.query(RefundPolicy).filter(RefundPolicy.id == r.policy_id).first()
            policy_code = pol.code if pol else None
    return {
        "id": r.id,
        "company_id": r.company_id,
        "company_name": company_name,
        "subscription_invoice_id": r.subscription_invoice_id,
        "billing_receipt_id": r.billing_receipt_id,
        "subscription_receipt_id": r.subscription_receipt_id,
        "policy_id": r.policy_id,
        "policy_code": policy_code,
        "amount": r.amount,
        "currency": r.currency,
        "reason": r.reason,
        "status": r.status,
        "actor_user_id": r.actor_user_id,
        "scenario_type": r.scenario_type,
        "calculation_type": r.calculation_type,
        "payment_source": r.payment_source,
        "requested_amount": r.requested_amount,
        "calculated_amount": r.calculated_amount,
        "approved_amount": r.approved_amount,
        "processed_amount": r.processed_amount,
        "original_paid_amount": r.original_paid_amount,
        "previously_refunded_amount": r.previously_refunded_amount,
        "remaining_refundable": r.remaining_refundable,
        "refund_method": r.refund_method,
        "stripe_refund_id": r.stripe_refund_id,
        "stripe_invoice_id": r.stripe_invoice_id,
        "credit_applied": bool(r.credit_applied),
        "credit_amount": r.credit_amount,
        "requires_approval": bool(r.requires_approval),
        "requested_by_user_id": r.requested_by_user_id,
        "approved_by_user_id": r.approved_by_user_id,
        "approved_at": r.approved_at,
        "rejected_by_user_id": r.rejected_by_user_id,
        "rejected_at": r.rejected_at,
        "rejection_reason": r.rejection_reason,
        "processed_by_user_id": r.processed_by_user_id,
        "processed_at": r.processed_at,
        "cancelled_by_user_id": r.cancelled_by_user_id,
        "cancelled_at": r.cancelled_at,
        "override_used": bool(r.override_used),
        "override_reason": r.override_reason,
        "idempotency_key": r.idempotency_key,
        "error_message": r.error_message,
        "notes": r.notes,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


def list_refunds(
    db: Session,
    *,
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = 200,
) -> list[dict]:
    q = db.query(PaymentRefund)
    if company_id:
        q = q.filter(PaymentRefund.company_id == company_id)
    if status:
        q = q.filter(PaymentRefund.status == status)
    rows = q.order_by(PaymentRefund.id.desc()).limit(max(1, min(limit, 500))).all()
    return [_serialize_refund(r, db) for r in rows]


def get_refund(db: Session, refund_id: int) -> dict:
    r = db.query(PaymentRefund).filter(PaymentRefund.id == refund_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Refund not found")
    out = _serialize_refund(r, db)
    events = (
        db.query(RefundEvent)
        .filter(RefundEvent.refund_id == refund_id)
        .order_by(RefundEvent.id.asc())
        .all()
    )
    out["events"] = [
        {
            "id": e.id,
            "action": e.action,
            "from_status": e.from_status,
            "to_status": e.to_status,
            "amount": e.amount,
            "note": e.note,
            "actor_user_id": e.actor_user_id,
            "created_at": e.created_at,
            "detail": json.loads(e.detail_json) if e.detail_json else None,
        }
        for e in events
    ]
    if r.policy_id:
        out["policy"] = _serialize_policy(get_policy(db, r.policy_id))
    return out


def create_refund(
    db: Session,
    *,
    actor: User,
    company_id: int,
    amount: Optional[float] = None,
    invoice_id: Optional[int] = None,
    billing_receipt_id: Optional[int] = None,
    subscription_receipt_id: Optional[int] = None,
    policy_id: Optional[int] = None,
    scenario_type: Optional[str] = None,
    reason: Optional[str] = None,
    notes: Optional[str] = None,
    refund_method: Optional[str] = None,
    override: bool = False,
    override_reason: Optional[str] = None,
    skip_approval: bool = False,
    auto_process: bool = False,
    idempotency_key: Optional[str] = None,
    request=None,
) -> dict:
    ensure_default_policies(db)
    key = (idempotency_key or "").strip() or None
    if key:
        existing = db.query(PaymentRefund).filter(PaymentRefund.idempotency_key == key).first()
        if existing:
            return _serialize_refund(existing, db)

    preview = preview_refund(
        db,
        company_id=company_id,
        policy_id=policy_id,
        scenario_type=scenario_type,
        invoice_id=invoice_id,
        billing_receipt_id=billing_receipt_id,
        subscription_receipt_id=subscription_receipt_id,
        requested_amount=amount,
        refund_method=refund_method,
        override=override,
    )
    if not preview["eligible"]:
        raise HTTPException(status_code=400, detail="; ".join(preview["errors"]) or "Refund not eligible")
    if override and not (override_reason or "").strip():
        raise HTTPException(status_code=400, detail="Override reason required")

    policy = get_policy(db, preview["policy"]["id"])
    final_amount = _round_money(preview["calculated_amount"])
    if final_amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Re-check over-refund under lock of remaining
    ctx = _resolve_payment_context(
        db,
        company_id=company_id,
        invoice_id=invoice_id,
        billing_receipt_id=billing_receipt_id,
        subscription_receipt_id=subscription_receipt_id,
    )
    if final_amount > ctx["remaining_refundable"] + 0.001 and not override:
        raise HTTPException(status_code=400, detail="Refund exceeds remaining refundable amount")

    requires_approval = bool(preview["requires_approval"]) and not skip_approval
    status = "pending_approval" if requires_approval else "approved"
    method = preview["refund_method"]

    row = PaymentRefund(
        company_id=company_id,
        subscription_invoice_id=invoice_id,
        billing_receipt_id=billing_receipt_id,
        subscription_receipt_id=subscription_receipt_id,
        policy_id=policy.id,
        amount=final_amount,
        currency=preview["currency"],
        reason=reason,
        status=status,
        actor_user_id=actor.id,
        scenario_type=policy.scenario_type,
        calculation_type=policy.calculation_type,
        payment_source=preview["payment_source"],
        requested_amount=amount,
        calculated_amount=final_amount,
        approved_amount=final_amount if status == "approved" else None,
        original_paid_amount=preview["original_paid_amount"],
        previously_refunded_amount=preview["previously_refunded_amount"],
        remaining_refundable=preview["remaining_refundable"],
        refund_method=method,
        stripe_invoice_id=preview.get("stripe_invoice_id"),
        requires_approval=requires_approval,
        requested_by_user_id=actor.id,
        approved_by_user_id=actor.id if status == "approved" else None,
        approved_at=_now() if status == "approved" else None,
        override_used=override,
        override_reason=override_reason if override else None,
        idempotency_key=key or f"rfnd-{uuid.uuid4().hex}",
        notes=notes,
        metadata_json=json.dumps({"preview_errors_cleared": preview["errors"]}),
    )
    db.add(row)
    db.flush()
    _add_event(
        db,
        row,
        actor=actor,
        action="created",
        from_status=None,
        to_status=status,
        amount=final_amount,
        note=reason,
        detail={"policy_code": policy.code, "override": override},
    )
    if status == "approved":
        _add_event(
            db,
            row,
            actor=actor,
            action="auto_approved",
            from_status="pending_approval",
            to_status="approved",
            amount=final_amount,
            note="Auto-approved by policy threshold",
        )
    db.commit()
    db.refresh(row)

    platform_audit_service.log(
        db,
        actor=actor,
        action="refund.created",
        target_type="refund",
        target_id=row.id,
        company_id=company_id,
        after=_serialize_refund(row),
        note=reason,
        request=request,
    )

    if auto_process and row.status == "approved":
        return process_refund(db, refund_id=row.id, actor=actor, request=request)
    return _serialize_refund(row, db)


def approve_refund(
    db: Session,
    *,
    refund_id: int,
    actor: User,
    approved_amount: Optional[float] = None,
    note: Optional[str] = None,
    request=None,
) -> dict:
    row = db.query(PaymentRefund).filter(PaymentRefund.id == refund_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Refund not found")
    if row.status != "pending_approval":
        raise HTTPException(status_code=400, detail=f"Cannot approve refund in status '{row.status}'")

    amt = _round_money(approved_amount if approved_amount is not None else (row.calculated_amount or row.amount))
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Approved amount must be positive")

    remaining = _committed_refund_total(
        db,
        company_id=row.company_id,
        subscription_invoice_id=row.subscription_invoice_id,
        billing_receipt_id=row.billing_receipt_id,
        subscription_receipt_id=row.subscription_receipt_id,
        exclude_refund_id=row.id,
    )
    paid = float(row.original_paid_amount or 0)
    left = _round_money(max(0.0, paid - remaining))
    if amt > left + 0.001:
        raise HTTPException(status_code=400, detail="Approved amount exceeds remaining refundable")

    prev = row.status
    row.status = "approved"
    row.approved_amount = amt
    row.amount = amt
    row.approved_by_user_id = actor.id
    row.approved_at = _now()
    _add_event(db, row, actor=actor, action="approved", from_status=prev, to_status="approved", amount=amt, note=note)
    db.commit()
    db.refresh(row)
    platform_audit_service.log(
        db,
        actor=actor,
        action="refund.approved",
        target_type="refund",
        target_id=row.id,
        company_id=row.company_id,
        after={"amount": amt},
        note=note,
        request=request,
    )
    return _serialize_refund(row, db)


def reject_refund(
    db: Session,
    *,
    refund_id: int,
    actor: User,
    reason: str,
    request=None,
) -> dict:
    if not (reason or "").strip():
        raise HTTPException(status_code=400, detail="Rejection reason required")
    row = db.query(PaymentRefund).filter(PaymentRefund.id == refund_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Refund not found")
    if row.status not in ("pending_approval", "approved"):
        raise HTTPException(status_code=400, detail=f"Cannot reject refund in status '{row.status}'")
    prev = row.status
    row.status = "rejected"
    row.rejected_by_user_id = actor.id
    row.rejected_at = _now()
    row.rejection_reason = reason.strip()
    _add_event(db, row, actor=actor, action="rejected", from_status=prev, to_status="rejected", note=reason)
    db.commit()
    db.refresh(row)
    platform_audit_service.log(
        db,
        actor=actor,
        action="refund.rejected",
        target_type="refund",
        target_id=row.id,
        company_id=row.company_id,
        note=reason,
        request=request,
    )
    return _serialize_refund(row, db)


def cancel_refund(
    db: Session,
    *,
    refund_id: int,
    actor: User,
    reason: Optional[str] = None,
    request=None,
) -> dict:
    row = db.query(PaymentRefund).filter(PaymentRefund.id == refund_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Refund not found")
    if row.status in ("completed", "processing", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel refund in status '{row.status}'")
    prev = row.status
    row.status = "cancelled"
    row.cancelled_by_user_id = actor.id
    row.cancelled_at = _now()
    _add_event(db, row, actor=actor, action="cancelled", from_status=prev, to_status="cancelled", note=reason)
    db.commit()
    db.refresh(row)
    platform_audit_service.log(
        db,
        actor=actor,
        action="refund.cancelled",
        target_type="refund",
        target_id=row.id,
        company_id=row.company_id,
        note=reason,
        request=request,
    )
    return _serialize_refund(row, db)


def _stripe_refund(row: PaymentRefund) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Returns (stripe_refund_id, charge_id, error)."""
    from app.config import settings
    import stripe

    if not settings.stripe_secret_key:
        return None, None, "Stripe is not configured"
    stripe.api_key = settings.stripe_secret_key
    charge_id = row.stripe_charge_id
    try:
        if not charge_id and row.stripe_invoice_id:
            inv = stripe.Invoice.retrieve(row.stripe_invoice_id, expand=["charge", "payment_intent"])
            if inv.charge:
                charge_id = inv.charge if isinstance(inv.charge, str) else inv.charge.id
            elif getattr(inv, "payment_intent", None):
                pi = inv.payment_intent
                if isinstance(pi, str):
                    pi = stripe.PaymentIntent.retrieve(pi)
                if pi.latest_charge:
                    charge_id = pi.latest_charge if isinstance(pi.latest_charge, str) else pi.latest_charge.id
        if not charge_id:
            return None, None, "No Stripe charge found for this payment; use manual or credit method"
        cents = int(round(float(row.amount) * 100))
        if cents <= 0:
            return None, None, "Invalid Stripe refund amount"
        ref = stripe.Refund.create(
            charge=charge_id,
            amount=cents,
            reason="requested_by_customer",
            metadata={
                "controlops_refund_id": str(row.id),
                "company_id": str(row.company_id),
                "idempotency_key": row.idempotency_key or "",
            },
        )
        return ref.id, charge_id, None
    except Exception as e:
        logger.exception("Stripe refund failed for refund %s", row.id)
        return None, charge_id, str(e)


def _apply_financials(db: Session, row: PaymentRefund, actor: User) -> None:
    amount = _round_money(row.amount)
    if row.subscription_invoice_id:
        inv = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.id == row.subscription_invoice_id).first()
        if inv:
            paid = _round_money(inv.amount_paid or 0)
            inv.amount_paid = _round_money(max(0.0, paid - amount))
            if inv.amount_paid <= 0:
                inv.status = "refunded"
                inv.amount_paid = 0
            elif inv.amount_paid < float(inv.total_amount or 0):
                inv.status = "partial"

    if row.billing_receipt_id:
        br = db.query(BillingReceipt).filter(BillingReceipt.id == row.billing_receipt_id).first()
        if br:
            already = _round_money(getattr(br, "amount_refunded", 0) or 0)
            br.amount_refunded = _round_money(min(float(br.amount or 0), already + amount))

    company = db.query(Company).filter(Company.id == row.company_id).first()
    if company and row.refund_method == "credit":
        company.account_credit_balance = _round_money((company.account_credit_balance or 0) + amount)
        row.credit_applied = True
        row.credit_amount = amount
        _push_credit_to_stripe(company, amount)

    db.add(
        SubscriptionChange(
            company_id=row.company_id,
            actor_user_id=actor.id,
            change_type="refund",
            from_status=company.subscription_status if company else None,
            to_status=company.subscription_status if company else None,
            from_tier=company.subscription_tier if company else None,
            to_tier=company.subscription_tier if company else None,
            note=f"Refund #{row.id}: {amount} {row.currency} via {row.refund_method} — {row.reason or ''}",
        )
    )


def _push_credit_to_stripe(company: Company, amount: float) -> None:
    """Mirror local account credit onto Stripe customer balance (negative = credit)."""
    if not company.stripe_customer_id or amount <= 0:
        return
    try:
        from app.config import settings
        import stripe

        if not settings.stripe_secret_key:
            return
        stripe.api_key = settings.stripe_secret_key
        stripe.Customer.create_balance_transaction(
            company.stripe_customer_id,
            amount=-int(round(amount * 100)),
            currency=(getattr(company, "currency", None) or "gbp"),
            description=f"ControlOps account credit for company {company.id}",
        )
    except Exception as e:
        logger.warning("Stripe customer balance credit failed for company %s: %s", company.id, e)


def consume_account_credit(db: Session, company: Company, up_to: float) -> float:
    """Consume local credit up to `up_to`. Returns amount consumed."""
    available = _round_money(getattr(company, "account_credit_balance", 0) or 0)
    if available <= 0 or up_to <= 0:
        return 0.0
    used = _round_money(min(available, up_to))
    company.account_credit_balance = _round_money(available - used)
    return used


def sync_stripe_refund_event(db: Session, charge: Any) -> Optional[dict]:
    """Idempotently record an inbound Stripe charge.refunded event."""
    import stripe

    charge_id = charge.id if hasattr(charge, "id") else charge.get("id")
    if not charge_id:
        return None
    refunds_data = []
    try:
        if hasattr(charge, "refunds") and charge.refunds:
            refunds_data = list(charge.refunds.data or [])
        else:
            refunds_data = list(stripe.Refund.list(charge=charge_id, limit=10).data)
    except Exception:
        return None

    out = None
    for ref in refunds_data:
        sid = ref.id
        existing = db.query(PaymentRefund).filter(PaymentRefund.stripe_refund_id == sid).first()
        if existing:
            out = _serialize_refund(existing, db)
            continue
        amount = _round_money((ref.amount or 0) / 100.0)
        currency = (ref.currency or "gbp").lower()
        company = None
        br = None
        # Prefer metadata company_id from our outbound refunds
        meta = getattr(ref, "metadata", None) or {}
        if meta.get("company_id"):
            try:
                company = db.query(Company).filter(Company.id == int(meta["company_id"])).first()
            except (TypeError, ValueError):
                company = None
        if not company and getattr(charge, "customer", None):
            company = db.query(Company).filter(Company.stripe_customer_id == charge.customer).first()
        # Match billing receipt via invoice on charge
        inv_id = getattr(charge, "invoice", None)
        if inv_id:
            br = db.query(BillingReceipt).filter(BillingReceipt.stripe_invoice_id == inv_id).first()
            if br and not company:
                company = db.query(Company).filter(Company.id == br.company_id).first()
        if not company:
            continue
        row = PaymentRefund(
            company_id=company.id,
            billing_receipt_id=br.id if br else None,
            amount=amount,
            currency=currency,
            reason="Stripe webhook charge.refunded",
            status="completed",
            scenario_type="partial",
            calculation_type="fixed",
            payment_source="billing_receipt" if br else "manual",
            requested_amount=amount,
            calculated_amount=amount,
            approved_amount=amount,
            processed_amount=amount,
            original_paid_amount=float(br.amount) if br else amount,
            refund_method="stripe",
            stripe_refund_id=sid,
            stripe_invoice_id=inv_id,
            stripe_charge_id=charge_id,
            requires_approval=False,
            processed_at=_now(),
            idempotency_key=f"stripe-{sid}",
            notes="Synced from Stripe charge.refunded",
        )
        db.add(row)
        db.flush()
        if br:
            already = _round_money(getattr(br, "amount_refunded", 0) or 0)
            br.amount_refunded = _round_money(min(float(br.amount or 0), already + amount))
        _add_event(
            db,
            row,
            actor=None,
            action="synced_from_stripe",
            from_status=None,
            to_status="completed",
            amount=amount,
            note="charge.refunded webhook",
        )
        db.commit()
        db.refresh(row)
        out = _serialize_refund(row, db)
    return out


def process_refund(
    db: Session,
    *,
    refund_id: int,
    actor: User,
    request=None,
) -> dict:
    row = db.query(PaymentRefund).filter(PaymentRefund.id == refund_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Refund not found")
    if row.status != "approved":
        raise HTTPException(status_code=400, detail=f"Refund must be approved before processing (status={row.status})")

    # Final over-refund guard
    remaining = _committed_refund_total(
        db,
        company_id=row.company_id,
        subscription_invoice_id=row.subscription_invoice_id,
        billing_receipt_id=row.billing_receipt_id,
        subscription_receipt_id=row.subscription_receipt_id,
        exclude_refund_id=row.id,
    )
    paid = float(row.original_paid_amount or 0)
    left = _round_money(max(0.0, paid - remaining))
    if float(row.amount) > left + 0.001 and not row.override_used:
        raise HTTPException(status_code=400, detail="Processing would over-refund this payment")

    # Duplicate Stripe prevention
    if row.stripe_refund_id:
        raise HTTPException(status_code=400, detail="Stripe refund already recorded for this refund")

    prev = row.status
    row.status = "processing"
    _add_event(db, row, actor=actor, action="processing", from_status=prev, to_status="processing", amount=row.amount)
    db.commit()

    stripe_err = None
    if row.refund_method == "stripe":
        sid, charge_id, stripe_err = _stripe_refund(row)
        if stripe_err:
            row.status = "failed"
            row.error_message = stripe_err
            _add_event(
                db,
                row,
                actor=actor,
                action="failed",
                from_status="processing",
                to_status="failed",
                note=stripe_err,
            )
            db.commit()
            platform_audit_service.log(
                db,
                actor=actor,
                action="refund.failed",
                target_type="refund",
                target_id=row.id,
                company_id=row.company_id,
                note=stripe_err,
                request=request,
            )
            raise HTTPException(status_code=400, detail=f"Stripe refund failed: {stripe_err}")
        row.stripe_refund_id = sid
        row.stripe_charge_id = charge_id

    try:
        _apply_financials(db, row, actor)
        row.status = "completed"
        row.processed_amount = row.amount
        row.processed_by_user_id = actor.id
        row.processed_at = _now()
        row.error_message = None
        _add_event(
            db,
            row,
            actor=actor,
            action="completed",
            from_status="processing",
            to_status="completed",
            amount=row.amount,
            detail={"stripe_refund_id": row.stripe_refund_id, "method": row.refund_method},
        )
        db.commit()
        db.refresh(row)
    except Exception as e:
        db.rollback()
        row = db.query(PaymentRefund).filter(PaymentRefund.id == refund_id).first()
        if row:
            row.status = "failed"
            row.error_message = str(e)
            db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to apply refund financials: {e}")

    platform_audit_service.log(
        db,
        actor=actor,
        action="refund.processed",
        target_type="refund",
        target_id=row.id,
        company_id=row.company_id,
        after=_serialize_refund(row),
        note=row.reason,
        request=request,
    )
    try:
        _notify_refund_processed(db, row)
    except Exception:
        logger.warning("Refund notification failed for %s", row.id)
    return _serialize_refund(row, db)


def _notify_refund_processed(db: Session, row: PaymentRefund) -> None:
    from app.services.email_service import send_email, is_configured
    from app.services.admin_billing_notify_service import ensure_templates, render_template
    from app.models import NotificationTemplate, PlatformNotification

    if not is_configured():
        return
    ensure_templates(db)
    company = db.query(Company).filter(Company.id == row.company_id).first()
    if not company:
        return
    admin = db.query(User).filter(User.id == company.admin_id).first()
    if not admin or not admin.email:
        return
    tmpl = db.query(NotificationTemplate).filter(NotificationTemplate.key == "refund_processed").first()
    vars = {
        "amount": f"{float(row.amount):.2f}",
        "currency": (row.currency or "gbp").upper(),
        "company_name": company.name,
        "refund_id": str(row.id),
        "reason": row.reason or "",
    }
    subject = render_template(tmpl.subject if tmpl else "Refund processed — {{amount}}", vars)
    body = render_template(
        tmpl.body
        if tmpl
        else "A refund of {{amount}} {{currency}} for {{company_name}} has been processed. Reference: refund #{{refund_id}}.",
        vars,
    )
    ok = send_email(admin.email, subject, body)
    db.add(
        PlatformNotification(
            company_id=company.id,
            user_id=admin.id,
            template_key="refund_processed",
            channel="email",
            subject=subject,
            body=body,
            status="sent" if ok else "failed",
            sent_at=_now() if ok else None,
        )
    )
    db.commit()


# Backward-compatible wrapper used by admin_complete / admin_billing_notify_service
def create_refund_legacy(
    db: Session,
    *,
    actor: User,
    company_id: int,
    amount: float,
    invoice_id: Optional[int] = None,
    reason: Optional[str] = None,
    request=None,
) -> dict:
    """Preserve old create path: invoice-based refund, approve + process immediately."""
    if not invoice_id:
        raise HTTPException(status_code=400, detail="invoice_id is required for refunds")
    return create_refund(
        db,
        actor=actor,
        company_id=company_id,
        amount=amount,
        invoice_id=invoice_id,
        scenario_type="fixed",
        policy_id=None,
        reason=reason,
        refund_method="manual",
        skip_approval=True,
        auto_process=True,
        request=request,
    )
