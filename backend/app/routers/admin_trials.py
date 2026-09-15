from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Company, User
from app.services import platform_audit_service
from app.services import trial_service
from app.services.platform_rbac_service import require_platform_perm

router = APIRouter(prefix="/admin", tags=["admin-trials"])


class TrialConfigUpdate(BaseModel):
    default_days: Optional[int] = None
    allowed_days: Optional[List[int]] = None
    allow_repeat: Optional[bool] = None
    require_card: Optional[bool] = None
    reminder_days: Optional[List[int]] = None
    eligible_tiers: Optional[List[str]] = None
    enabled: Optional[bool] = None


class StartTrialBody(BaseModel):
    duration_days: Optional[int] = None
    notes: Optional[str] = None
    force: bool = False


class ExtendTrialBody(BaseModel):
    extension_days: int = Field(..., ge=1, le=90)
    reason: str


@router.get("/trials/config")
def get_config(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("trials.read", "billing.read", "config.read"))):
    return trial_service.get_trial_config(db)


@router.put("/trials/config")
def put_config(
    body: TrialConfigUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("trials.write", "billing.write", "config.write")),
):
    out = trial_service.update_trial_config(db, body.model_dump(exclude_unset=True), current_user)
    platform_audit_service.log(
        db,
        actor=current_user,
        action="trial.config_updated",
        target_type="config",
        target_label="trial_config",
        after=out.get("value") if isinstance(out, dict) else out,
        request=request,
    )
    return trial_service.get_trial_config(db)


@router.get("/trials")
def list_trials(
    status: Optional[str] = None,
    company_id: Optional[int] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("trials.read", "billing.read", "tenants.read")),
):
    return trial_service.list_trials(db, status=status, company_id=company_id, limit=limit)


@router.get("/trials/{trial_id}")
def get_trial(trial_id: int, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("trials.read", "billing.read", "tenants.read"))):
    return trial_service.get_trial(db, trial_id)


@router.post("/companies/{company_id}/trials")
def start_company_trial(
    company_id: int,
    body: StartTrialBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("trials.write", "billing.write")),
):
    return trial_service.start_trial(
        db,
        company_id,
        actor=current_user,
        duration_days=body.duration_days,
        notes=body.notes,
        source="admin",
        force=body.force,
        request=request,
    )


@router.post("/trials/{trial_id}/extend")
def extend_trial(
    trial_id: int,
    body: ExtendTrialBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("trials.write", "billing.write")),
):
    return trial_service.extend_trial(
        db,
        trial_id,
        actor=current_user,
        extension_days=body.extension_days,
        reason=body.reason,
        request=request,
    )


@router.get("/companies/{company_id}/trials")
def company_trial_history(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("trials.read", "billing.read", "tenants.read")),
):
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Company not found")
    rows = trial_service.trial_history_for_company(db, company_id)
    eligible, reason = trial_service.is_eligible_for_trial(db, co, force=False)
    return {
        "company_id": company_id,
        "eligible_for_new_trial": eligible,
        "eligibility_reason": reason,
        "current": trial_service.tenant_trial_status(db, co),
        "history": [trial_service._trial_out(t, co) for t in rows],
    }


@router.post("/trials/expire-due")
def expire_due(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("trials.write", "billing.write", "ops.write"))):
    return trial_service.sync_expired_trials(db)


# Tenant-facing trial status (authenticated company user)
tenant_router = APIRouter(prefix="/subscriptions", tags=["subscriptions-trial"])


@tenant_router.get("/trial-status")
def tenant_trial_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.company_id:
        return {"subscription_status": None, "trial_active": False, "can_use_paid_features": True}
    co = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not co:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Company not found")
    return trial_service.tenant_trial_status(db, co)
