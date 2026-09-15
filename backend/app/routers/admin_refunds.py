from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services import platform_audit_service
from app.services import refund_service
from app.services.platform_rbac_service import require_platform_perm

router = APIRouter(prefix="/admin", tags=["admin-refunds"])


class PolicyBody(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    scenario_type: Optional[str] = None
    calculation_type: Optional[str] = None
    percentage: Optional[float] = None
    fixed_amount: Optional[float] = None
    requires_approval: Optional[bool] = None
    auto_approve_below: Optional[float] = None
    max_refund_percent: Optional[float] = None
    max_refund_amount: Optional[float] = None
    min_days_after_payment: Optional[int] = None
    max_days_after_payment: Optional[int] = None
    eligible_payment_statuses: Optional[List[str]] = None
    allow_stripe: Optional[bool] = None
    allow_credit: Optional[bool] = None
    allow_manual: Optional[bool] = None
    default_refund_method: Optional[str] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None


class PreviewBody(BaseModel):
    company_id: int
    policy_id: Optional[int] = None
    scenario_type: Optional[str] = None
    invoice_id: Optional[int] = None
    billing_receipt_id: Optional[int] = None
    subscription_receipt_id: Optional[int] = None
    requested_amount: Optional[float] = None
    refund_method: Optional[str] = None
    override: bool = False


class CreateRefundBody(BaseModel):
    company_id: int
    amount: Optional[float] = None
    invoice_id: Optional[int] = None
    billing_receipt_id: Optional[int] = None
    subscription_receipt_id: Optional[int] = None
    policy_id: Optional[int] = None
    scenario_type: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    refund_method: Optional[str] = None
    override: bool = False
    override_reason: Optional[str] = None
    skip_approval: bool = False
    auto_process: bool = False
    idempotency_key: Optional[str] = None


class ApproveBody(BaseModel):
    approved_amount: Optional[float] = None
    note: Optional[str] = None


class RejectBody(BaseModel):
    reason: str = Field(..., min_length=1)


class CancelBody(BaseModel):
    reason: Optional[str] = None


@router.get("/refund-policies")
def list_policies(
    active_only: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("refunds.read", "refunds.policies", "billing.read")),
):
    return refund_service.list_policies(db, active_only=active_only)


@router.post("/refund-policies")
def create_policy(
    body: PolicyBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("refunds.policies", "billing.write")),
):
    out = refund_service.upsert_policy(db, body.model_dump(exclude_unset=True), current_user)
    platform_audit_service.log(
        db,
        actor=current_user,
        action="refund_policy.created",
        target_type="refund_policy",
        target_id=out.get("id"),
        target_label=out.get("code"),
        after=out,
        request=request,
    )
    return out


@router.put("/refund-policies/{policy_id}")
def update_policy(
    policy_id: int,
    body: PolicyBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("refunds.policies", "billing.write")),
):
    out = refund_service.upsert_policy(db, body.model_dump(exclude_unset=True), current_user, policy_id=policy_id)
    platform_audit_service.log(
        db,
        actor=current_user,
        action="refund_policy.updated",
        target_type="refund_policy",
        target_id=policy_id,
        target_label=out.get("code"),
        after=out,
        request=request,
    )
    return out


@router.post("/refunds/preview")
def preview_refund(
    body: PreviewBody,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("refunds.read", "refunds.create", "billing.read")),
):
    return refund_service.preview_refund(
        db,
        company_id=body.company_id,
        policy_id=body.policy_id,
        scenario_type=body.scenario_type,
        invoice_id=body.invoice_id,
        billing_receipt_id=body.billing_receipt_id,
        subscription_receipt_id=body.subscription_receipt_id,
        requested_amount=body.requested_amount,
        refund_method=body.refund_method,
        override=body.override,
    )


@router.get("/refunds/{refund_id}")
def get_refund(
    refund_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("refunds.read", "billing.read")),
):
    return refund_service.get_refund(db, refund_id)


@router.post("/refunds/{refund_id}/approve")
def approve_refund(
    refund_id: int,
    body: ApproveBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("refunds.approve", "billing.write")),
):
    return refund_service.approve_refund(
        db,
        refund_id=refund_id,
        actor=current_user,
        approved_amount=body.approved_amount,
        note=body.note,
        request=request,
    )


@router.post("/refunds/{refund_id}/reject")
def reject_refund(
    refund_id: int,
    body: RejectBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("refunds.approve", "billing.write")),
):
    return refund_service.reject_refund(
        db, refund_id=refund_id, actor=current_user, reason=body.reason, request=request
    )


@router.post("/refunds/{refund_id}/process")
def process_refund(
    refund_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("refunds.process", "billing.write")),
):
    return refund_service.process_refund(db, refund_id=refund_id, actor=current_user, request=request)


@router.post("/refunds/{refund_id}/cancel")
def cancel_refund(
    refund_id: int,
    body: CancelBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("refunds.cancel", "billing.write")),
):
    return refund_service.cancel_refund(
        db, refund_id=refund_id, actor=current_user, reason=body.reason, request=request
    )
