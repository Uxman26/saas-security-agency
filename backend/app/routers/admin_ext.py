from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth import current_session_jti, get_current_super_admin, get_current_user
from app.services.platform_rbac_service import require_platform_perm
from app.database import get_db
from app.models import Company, SubscriptionChange, User
from app.services import admin_ops_service as ops
from app.services import admin_platform_ext_service as ext
from app.services import admin_platform_service as ap
from app.services import platform_audit_service
from app.services import support_ticket_service as tickets
from app.services import subscription_invoice_service as sub_inv
from app.services import tenant_usage_service

router = APIRouter(prefix="/admin", tags=["admin-platform"])


class TicketCreate(BaseModel):
    subject: str
    body: Optional[str] = None
    company_id: Optional[int] = None
    category: Optional[str] = "general"
    priority: Optional[str] = "medium"
    assigned_to_user_id: Optional[int] = None


class TicketUpdate(BaseModel):
    subject: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assigned_to_user_id: Optional[int] = None
    company_id: Optional[int] = None


class TicketMessageCreate(BaseModel):
    body: str
    is_internal: bool = False


class AccountStatusBody(BaseModel):
    status: str
    reason: Optional[str] = None


class TempAccessBody(BaseModel):
    reason: str


class ImpersonateBody(BaseModel):
    user_id: int
    reason: str
    mode: str = "support"


class FeatureFlagBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None


class TenantFeatureBody(BaseModel):
    enabled: Optional[bool] = None
    limit_value: Optional[int] = None
    config_json: Optional[Any] = None


class ConfigBody(BaseModel):
    value: Any
    category: str = "general"
    is_sensitive: bool = False


class NotifyBody(BaseModel):
    company_id: Optional[int] = None
    user_id: Optional[int] = None
    subject: str
    body: str
    channel: str = "email"


class SubscriptionActionBody(BaseModel):
    action: str
    tier: Optional[str] = None
    billing_cycle: Optional[str] = None
    note: Optional[str] = None


class SendResetEmailBody(BaseModel):
    user_id: int


@router.get("/dashboard/extended")
def extended_dashboard(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("tenants.read", "billing.read", "ops.read"))):
    from app.services import admin_hq_service

    sub_inv.ensure_renewal_invoices(db)
    base = sub_inv.dashboard_stats(db)
    hq = admin_hq_service.hq_snapshot(db)
    return {
        **base,
        "inactive_tenants": hq["tenants"]["total"] - hq["tenants"]["active"] - hq["tenants"]["trialing"],
        "new_tenants_7d": hq["tenants"]["new_7d"],
        "active_users": hq["tenants"]["active_users"],
        "locked_accounts": hq["tenants"]["locked"],
        "trial_subscriptions": hq["tenants"]["trialing"],
        "expiring_subscriptions": hq["tenants"]["expiring_14d"],
        "mrr": hq["billing"]["mrr"],
        "arr": hq["billing"]["arr"],
        "net_revenue": hq["billing"]["net_revenue"],
        "refunds_total": hq["billing"]["refunds_total"],
        "refunds_30d": hq["billing"]["refunds_30d"],
        "refunds_pending": hq["billing"]["refunds_pending"],
        "credit_liability": hq["billing"]["credit_liability"],
        "churn_rate_30d_pct": hq["billing"]["churn_rate_30d_pct"],
        "failed_subscriptions": hq["billing"]["failed_subscriptions"],
        "failed_invoices": hq["billing"]["failed_invoices"],
        "open_tickets": hq["ops"]["open_tickets"],
        "sla_breaches": hq["ops"]["sla_breaches"],
        "critical_errors": hq["ops"]["critical_errors"],
        "failed_jobs": hq["ops"]["failed_jobs"],
        "platform_usage": hq["ops"]["platform_usage"],
        "hq": hq,
        "recent_security_events": hq["lists"]["recent_security_events"],
    }


@router.get("/hq")
def admin_hq(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("tenants.read", "billing.read", "ops.read"))):
    from app.services import admin_hq_service

    return admin_hq_service.hq_snapshot(db)


@router.get("/ops/health")
def ops_health(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("ops.read", "tenants.read"))):
    from app.services import admin_hq_service

    return admin_hq_service.ops_health(db)


@router.get("/me/permissions")
def my_permissions(db: Session = Depends(get_db), current_user: User = Depends(get_current_super_admin)):
    from app.services.platform_rbac_service import user_platform_permission_codes

    codes = sorted(user_platform_permission_codes(db, current_user))
    return {"permissions": codes, "user_id": current_user.id}


@router.get("/search")
def search(q: str, limit: int = 20, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("tenants.read"))):
    return ext.global_search(db, q, limit)


@router.get("/companies/{company_id}/support-view")
def company_support_view(company_id: int, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("support.read", "tenants.read"))):
    return ops.tenant_support_view(db, company_id)


@router.post("/companies/{company_id}/account-status")
def company_account_status(
    company_id: int,
    body: AccountStatusBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("tenants.lock", "tenants.write")),
):
    co = ops.set_account_status(db, company_id, body.status, actor=current_user, reason=body.reason, request=request)
    return {"id": co.id, "account_status": getattr(co, "account_status", None), "subscription_status": co.subscription_status}


@router.post("/companies/{company_id}/temp-access")
def grant_temp_access(
    company_id: int,
    body: TempAccessBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("security.write", "tenants.write", "support.write")),
):
    return ops.grant_temporary_access(db, company_id, actor=current_user, reason=body.reason, request=request)


@router.get("/temp-access")
def list_temp_access(company_id: Optional[int] = None, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("security.read", "tenants.read", "support.read"))):
    return ops.list_temp_access(db, company_id)


@router.post("/temp-access/{session_id}/revoke")
def revoke_temp_access(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("security.write", "tenants.write", "support.write")),
):
    return ops.revoke_temp_access(db, session_id, current_user, request)


@router.post("/companies/{company_id}/subscription-action")
def subscription_action(
    company_id: int,
    body: SubscriptionActionBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("billing.write", "tenants.write")),
):
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Company not found")
    before = {
        "subscription_tier": co.subscription_tier,
        "subscription_status": co.subscription_status,
        "billing_cycle": co.billing_cycle,
    }
    action = body.action
    if action == "upgrade" and body.tier:
        co.subscription_tier = body.tier
        co.subscription_status = "active"
    elif action == "downgrade" and body.tier:
        co.subscription_tier = body.tier
    elif action == "suspend":
        co.subscription_status = "suspended"
    elif action == "cancel":
        co.subscription_status = "cancelled"
    elif action == "reactivate":
        co.subscription_status = "active"
    elif action == "start_trial":
        from app.services import trial_service
        trial_service.start_trial(
            db,
            company_id,
            actor=current_user,
            duration_days=None,
            notes=body.note,
            source="admin",
            force=bool(body.note and len(body.note) >= 5),
            request=request,
        )
        co = db.query(Company).filter(Company.id == company_id).first()
        return ap.company_admin_out(db, co)
    elif action == "extend_trial":
        from app.services import trial_service
        from fastapi import HTTPException
        trial = trial_service.active_trial_for_company(db, company_id)
        if not trial:
            hist = trial_service.trial_history_for_company(db, company_id)
            trial = next((t for t in hist if t.status in ("expired", "extended", "active")), None)
        if not trial:
            raise HTTPException(status_code=404, detail="No trial to extend")
        days = 14
        reason = body.note or "Admin extension via subscription action"
        trial_service.extend_trial(
            db,
            trial.id,
            actor=current_user,
            extension_days=days,
            reason=reason,
            request=request,
        )
        co = db.query(Company).filter(Company.id == company_id).first()
        return ap.company_admin_out(db, co)
    if body.billing_cycle:
        co.billing_cycle = body.billing_cycle
    if action in ("upgrade", "downgrade", "cancel", "reactivate"):
        from app.services import stripe_subscription_service as stripe_svc

        stripe_svc.apply_admin_stripe_action(
            db,
            co,
            action,
            tier=body.tier,
            billing_cycle=body.billing_cycle or co.billing_cycle,
        )
    change = SubscriptionChange(
        company_id=co.id,
        actor_user_id=current_user.id,
        change_type=action,
        from_tier=before["subscription_tier"],
        to_tier=co.subscription_tier,
        from_status=before["subscription_status"],
        to_status=co.subscription_status,
        from_cycle=before["billing_cycle"],
        to_cycle=co.billing_cycle,
        note=body.note,
    )
    db.add(change)
    db.commit()
    platform_audit_service.log(
        db,
        actor=current_user,
        action=f"subscription.{action}",
        target_type="company",
        target_id=co.id,
        target_label=co.name,
        company=co,
        before=before,
        after={"subscription_tier": co.subscription_tier, "subscription_status": co.subscription_status, "billing_cycle": co.billing_cycle},
        note=body.note,
        request=request,
    )
    return ap.company_admin_out(db, co)


@router.get("/tickets")
def list_tickets(
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to_user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("support.read")),
):
    return tickets.list_tickets(
        db,
        company_id=company_id,
        status=status,
        priority=priority,
        assigned_to_user_id=assigned_to_user_id,
    )


@router.post("/tickets")
def create_ticket(
    body: TicketCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    row = tickets.create_ticket(db, current_user, body.model_dump())
    platform_audit_service.log(
        db,
        actor=current_user,
        action="ticket.created",
        target_type="ticket",
        target_id=row["id"],
        target_label=row["ticket_number"],
        company_id=row.get("company_id"),
        request=request,
    )
    return row


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: int, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("support.read"))):
    return tickets.get_ticket(db, ticket_id)


@router.patch("/tickets/{ticket_id}")
def patch_ticket(
    ticket_id: int,
    body: TicketUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    row = tickets.update_ticket(db, ticket_id, body.model_dump(exclude_unset=True))
    platform_audit_service.log(
        db,
        actor=current_user,
        action="ticket.updated",
        target_type="ticket",
        target_id=row["id"],
        target_label=row["ticket_number"],
        company_id=row.get("company_id"),
        after=body.model_dump(exclude_unset=True),
        request=request,
    )
    return row


@router.post("/tickets/{ticket_id}/messages")
def ticket_message(
    ticket_id: int,
    body: TicketMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    return tickets.add_message(db, ticket_id, current_user, body.body, body.is_internal)


@router.get("/errors")
def list_errors(
    company_id: Optional[int] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    source: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("ops.read")),
):
    rows = ext.list_errors(db, company_id=company_id, severity=severity, status=status, source=source)
    return [
        {
            "id": r.id,
            "company_id": r.company_id,
            "source": r.source,
            "module": r.module,
            "severity": r.severity,
            "status": r.status,
            "error_code": r.error_code,
            "message": r.message,
            "stack_trace": r.stack_trace,
            "path": r.path,
            "method": r.method,
            "occurrence_count": r.occurrence_count,
            "first_seen_at": r.first_seen_at,
            "last_seen_at": r.last_seen_at,
            "resolved_at": r.resolved_at,
        }
        for r in rows
    ]


@router.post("/errors/{error_id}/resolve")
def resolve_error(
    error_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("ops.write")),
):
    row = ext.resolve_error(db, error_id, current_user)
    platform_audit_service.log(
        db,
        actor=current_user,
        action="error.resolved",
        target_type="error",
        target_id=row.id,
        request=request,
    )
    return {"id": row.id, "status": row.status}


@router.get("/security-events")
def security_events(company_id: Optional[int] = None, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("security.read"))):
    rows = ext.list_security_events(db, company_id=company_id)
    return [
        {
            "id": r.id,
            "company_id": r.company_id,
            "user_id": r.user_id,
            "event_type": r.event_type,
            "severity": r.severity,
            "message": r.message,
            "ip_address": r.ip_address,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/sessions")
def list_sessions(company_id: Optional[int] = None, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("security.read"))):
    return ops.list_active_sessions(db, company_id=company_id)


@router.post("/sessions/{session_id}/revoke")
def revoke_session(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("security.write")),
):
    return ops.force_logout_session(db, session_id, current_user, request)


@router.post("/impersonate")
def impersonate(
    body: ImpersonateBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("impersonate.start")),
    jti: Optional[str] = Depends(current_session_jti),
):
    if not jti:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="No session")
    return ops.start_impersonation(
        db,
        actor=current_user,
        target_user_id=body.user_id,
        parent_jti=jti,
        reason=body.reason,
        mode=body.mode,
        request=request,
    )


@router.post("/impersonate/end")
def end_impersonate(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    jti: Optional[str] = Depends(current_session_jti),
):
    from fastapi import HTTPException
    from app.models import UserSession
    from app.services import session_service

    if not jti:
        raise HTTPException(status_code=401, detail="No session")
    row = db.query(UserSession).filter(UserSession.jti == jti).first()
    if not row or not row.impersonator_user_id:
        raise HTTPException(status_code=400, detail="Not an impersonation session")
    if current_user.id not in (row.impersonator_user_id, row.user_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    actor = db.query(User).filter(User.id == row.impersonator_user_id).first() or current_user
    session_service.revoke(db, jti)
    platform_audit_service.log(
        db,
        actor=actor,
        action="impersonation.end",
        target_type="user",
        target_id=row.user_id,
        request=request,
    )
    return {"ended": True, "parent_jti": row.parent_jti}


@router.get("/feature-flags")
def feature_flags(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("config.read"))):
    return [
        {"id": f.id, "key": f.key, "name": f.name, "description": f.description, "enabled": f.enabled}
        for f in ext.list_feature_flags(db)
    ]


@router.put("/feature-flags/{key}")
def upsert_flag(
    key: str,
    body: FeatureFlagBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("config.write")),
):
    row = ext.upsert_feature_flag(db, key, body.model_dump(exclude_unset=True))
    platform_audit_service.log(
        db,
        actor=current_user,
        action="feature_flag.updated",
        target_type="feature_flag",
        target_label=key,
        after={"enabled": row.enabled},
        request=request,
    )
    return {"id": row.id, "key": row.key, "name": row.name, "description": row.description, "enabled": row.enabled}


@router.get("/companies/{company_id}/features")
def company_features(company_id: int, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("tenants.read", "config.read"))):
    return [
        {"id": f.id, "feature_key": f.feature_key, "enabled": f.enabled, "limit_value": f.limit_value, "config_json": f.config_json}
        for f in ext.list_tenant_features(db, company_id)
    ]


@router.put("/companies/{company_id}/features/{feature_key}")
def set_company_feature(
    company_id: int,
    feature_key: str,
    body: TenantFeatureBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("tenants.write", "config.write")),
):
    row = ext.set_tenant_feature(db, company_id, feature_key, body.model_dump(exclude_unset=True))
    platform_audit_service.log(
        db,
        actor=current_user,
        action="tenant_feature.updated",
        target_type="tenant_feature",
        target_label=feature_key,
        company_id=company_id,
        after={"enabled": row.enabled, "limit_value": row.limit_value},
        request=request,
    )
    return {"id": row.id, "feature_key": row.feature_key, "enabled": row.enabled, "limit_value": row.limit_value}


@router.get("/jobs")
def list_jobs(status: Optional[str] = None, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("ops.read"))):
    rows = ext.list_jobs(db, status=status)
    return [
        {
            "id": r.id,
            "job_name": r.job_name,
            "queue": r.queue,
            "status": r.status,
            "company_id": r.company_id,
            "attempts": r.attempts,
            "error_message": r.error_message,
            "started_at": r.started_at,
            "finished_at": r.finished_at,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: int, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("ops.write"))):
    r = ext.retry_job(db, job_id)
    return {"id": r.id, "status": r.status, "attempts": r.attempts}


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: int, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("ops.write"))):
    r = ext.cancel_job(db, job_id)
    return {"id": r.id, "status": r.status}


@router.get("/webhooks")
def list_webhooks(company_id: Optional[int] = None, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("ops.read"))):
    rows = ext.list_webhooks(db, company_id=company_id)
    return [
        {
            "id": r.id,
            "company_id": r.company_id,
            "provider": r.provider,
            "event_type": r.event_type,
            "status": r.status,
            "http_status": r.http_status,
            "error_message": r.error_message,
            "attempts": r.attempts,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/platform-roles")
def platform_roles(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("config.read"))):
    return ext.list_platform_roles(db)


@router.get("/config")
def list_config(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("config.read"))):
    return ext.list_config(db)


@router.put("/config/{key}")
def put_config(
    key: str,
    body: ConfigBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("config.write")),
):
    out = ext.set_config(db, key, body.value, actor=current_user, category=body.category, is_sensitive=body.is_sensitive)
    platform_audit_service.log(
        db,
        actor=current_user,
        action="config.updated",
        target_type="config",
        target_label=key,
        after={"category": body.category} if body.is_sensitive else out,
        request=request,
    )
    return out


@router.post("/notify")
def send_notification(
    body: NotifyBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write", "config.write")),
):
    from app.models import PlatformNotification
    from app.services.email_service import send_email

    row = PlatformNotification(
        company_id=body.company_id,
        user_id=body.user_id,
        channel=body.channel,
        subject=body.subject,
        body=body.body,
        status="queued",
        sent_by_user_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    recipient = None
    if body.user_id:
        u = db.query(User).filter(User.id == body.user_id).first()
        recipient = u.email if u else None
    elif body.company_id:
        co = db.query(Company).filter(Company.id == body.company_id).first()
        if co and co.admin_id:
            u = db.query(User).filter(User.id == co.admin_id).first()
            recipient = (u.email if u else None) or co.email
    try:
        if recipient and body.channel == "email":
            send_email(recipient, body.subject, body.body)
            row.status = "sent"
            row.sent_at = datetime.now(timezone.utc)
        else:
            row.status = "queued"
        db.commit()
    except Exception as e:
        row.status = "failed"
        row.error_message = str(e)[:500]
        db.commit()
    platform_audit_service.log(
        db,
        actor=current_user,
        action="notification.sent",
        target_type="notification",
        target_id=row.id,
        company_id=body.company_id,
        after={"status": row.status, "subject": body.subject},
        request=request,
    )
    return {"id": row.id, "status": row.status, "recipient": recipient}


@router.post("/users/send-reset-email")
def send_reset_email(
    body: SendResetEmailBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("security.write", "tenants.write", "support.write")),
):
    from app.services import auth_service

    u = db.query(User).filter(User.id == body.user_id).first()
    if not u:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    ip, _ = platform_audit_service.request_meta(request)
    auth_service.request_password_reset(
        db,
        u.email,
        requested_by_user_id=current_user.id,
        ip_address=ip,
    )
    platform_audit_service.log(
        db,
        actor=current_user,
        action="user.password_reset_email",
        target_type="user",
        target_id=u.id,
        target_label=u.email,
        company_id=u.company_id,
        request=request,
    )
    return {"sent": True, "email": u.email}


class SetTenantPasswordBody(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_rules(cls, v: str) -> str:
        from app.schemas import validate_password_strength

        return validate_password_strength(v)


@router.post("/users/{user_id}/set-password")
def set_tenant_password(
    user_id: int,
    body: SetTenantPasswordBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("security.write", "tenants.write")),
):
    from app.services import admin_platform_service as ap

    u = ap.reset_tenant_user_password(db, user_id, body.new_password)
    platform_audit_service.log(
        db,
        actor=current_user,
        action="user.password_reset",
        target_type="user",
        target_id=u.id,
        target_label=u.email,
        company_id=u.company_id,
        request=request,
        after={"method": "admin_set_password"},
    )
    return {"id": u.id, "email": u.email, "reset": True}


@router.get("/reports/summary")
def reports_summary(
    days: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("tenants.read", "billing.read", "ops.read")),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=max(1, min(days, 365)))
    companies = db.query(Company).all()
    new_tenants = [
        c
        for c in companies
        if c.created_at and (c.created_at if c.created_at.tzinfo else c.created_at.replace(tzinfo=timezone.utc)) >= since
    ]
    from app.models import SubscriptionInvoice, LoginLog, SupportTicket, ErrorLog, ApiUsageLog

    invoices = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.created_at >= since).all()
    paid = sum(float(i.amount_paid or 0) for i in invoices)
    from app.models import PaymentRefund

    refunds = (
        db.query(PaymentRefund)
        .filter(PaymentRefund.status == "completed", PaymentRefund.created_at >= since)
        .all()
    )
    refunded = sum(float(r.processed_amount or r.amount or 0) for r in refunds)
    logins = db.query(LoginLog).filter(LoginLog.login_at >= since).count()
    open_tickets = db.query(SupportTicket).filter(SupportTicket.status.in_(["open", "in_progress", "escalated"])).count()
    errors = db.query(ErrorLog).filter(ErrorLog.last_seen_at >= since).count()
    api_calls = db.query(ApiUsageLog).filter(ApiUsageLog.logged_at >= since).count()
    by_tier = {}
    for c in companies:
        tier = c.subscription_tier or "unknown"
        by_tier[tier] = by_tier.get(tier, 0) + 1
    return {
        "period_days": days,
        "new_tenants": len(new_tenants),
        "revenue_collected": round(paid, 2),
        "refunds_total": round(refunded, 2),
        "net_revenue": round(paid - refunded, 2),
        "invoices_created": len(invoices),
        "logins": logins,
        "open_tickets": open_tickets,
        "errors": errors,
        "api_calls": api_calls,
        "tenants_by_tier": by_tier,
        "active_tenants": sum(1 for c in companies if c.subscription_status == "active"),
    }
