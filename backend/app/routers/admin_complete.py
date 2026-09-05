from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_super_admin, get_current_user
from app.database import get_db
from app.models import ApiUsageLog, Company, User, WebhookLog
from app.services import admin_billing_notify_service as billing_notify
from app.services import admin_platform_ext_service as ext
from app.services import gdpr_service
from app.services import platform_audit_service
from app.services import platform_rbac_service as rbac
from app.services import suspicious_activity_service as suspicious
from app.services.platform_rbac_service import require_platform_perm

router = APIRouter(prefix="/admin", tags=["admin-complete"])


class RefundBody(BaseModel):
    company_id: int
    amount: float
    invoice_id: Optional[int] = None
    reason: Optional[str] = None


class DisputeBody(BaseModel):
    note: Optional[str] = None


class TemplateBody(BaseModel):
    name: Optional[str] = None
    channel: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    is_active: Optional[bool] = None


class RetentionBody(BaseModel):
    login_logs_days: Optional[int] = None
    audit_logs_days: Optional[int] = None
    api_usage_days: Optional[int] = None
    email_logs_days: Optional[int] = None
    error_logs_days: Optional[int] = None
    security_events_days: Optional[int] = None


class DeleteTenantBody(BaseModel):
    confirm_name: str
    hard_delete: bool = False


class AssignRoleBody(BaseModel):
    user_id: int
    role_slug: str


class PasswordPolicyBody(BaseModel):
    min_length: Optional[int] = 9
    require_upper: Optional[bool] = True
    require_lower: Optional[bool] = True
    require_digit: Optional[bool] = True
    require_special: Optional[bool] = True
    max_age_days: Optional[int] = None


class MaintenanceBody(BaseModel):
    enabled: bool
    message: Optional[str] = None


@router.get("/api-usage")
def api_usage(
    company_id: Optional[int] = None,
    days: int = 7,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("ops.read", "tenants.read")),
):
    since = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 90)))
    q = db.query(ApiUsageLog).filter(ApiUsageLog.logged_at >= since)
    if company_id:
        q = q.filter(ApiUsageLog.company_id == company_id)
    total = q.count()
    by_company = (
        db.query(ApiUsageLog.company_id, func.count(ApiUsageLog.id))
        .filter(ApiUsageLog.logged_at >= since)
        .group_by(ApiUsageLog.company_id)
        .order_by(func.count(ApiUsageLog.id).desc())
        .limit(50)
        .all()
    )
    by_path = (
        db.query(ApiUsageLog.path, func.count(ApiUsageLog.id))
        .filter(ApiUsageLog.logged_at >= since)
        .group_by(ApiUsageLog.path)
        .order_by(func.count(ApiUsageLog.id).desc())
        .limit(30)
        .all()
    )
    companies = {c.id: c.name for c in db.query(Company).all()}
    recent = q.order_by(ApiUsageLog.id.desc()).limit(100).all()
    return {
        "total": total,
        "days": days,
        "by_company": [
            {"company_id": cid, "company_name": companies.get(cid), "count": cnt} for cid, cnt in by_company
        ],
        "by_path": [{"path": p, "count": cnt} for p, cnt in by_path],
        "recent": [
            {
                "id": r.id,
                "company_id": r.company_id,
                "path": r.path,
                "method": r.method,
                "logged_at": r.logged_at,
            }
            for r in recent
        ],
    }


@router.get("/refunds")
def list_refunds(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("billing.read")),
):
    return billing_notify.list_refunds(db, company_id)


@router.post("/refunds")
def create_refund(
    body: RefundBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("billing.write")),
):
    return billing_notify.create_refund(
        db,
        actor=current_user,
        company_id=body.company_id,
        amount=body.amount,
        invoice_id=body.invoice_id,
        reason=body.reason,
        request=request,
    )


@router.post("/invoices/{invoice_id}/dispute")
def dispute_invoice(
    invoice_id: int,
    body: DisputeBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("billing.write")),
):
    return billing_notify.mark_invoice_disputed(db, invoice_id, current_user, body.note, request)


@router.get("/notification-templates")
def list_templates(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("config.read", "tenants.read"))):
    return billing_notify.list_templates(db)


@router.put("/notification-templates/{key}")
def put_template(
    key: str,
    body: TemplateBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("config.write")),
):
    out = billing_notify.upsert_template(db, key, body.model_dump(exclude_unset=True))
    platform_audit_service.log(
        db,
        actor=current_user,
        action="notification_template.updated",
        target_type="template",
        target_label=key,
        request=request,
    )
    return out


@router.get("/notification-logs")
def notification_logs(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("ops.read", "tenants.read"))):
    return billing_notify.list_notification_logs(db)


@router.post("/tickets/{ticket_id}/attachments")
async def upload_ticket_attachment(
    ticket_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    return await billing_notify.save_ticket_attachment(db, ticket_id, file, current_user)


@router.get("/companies/{company_id}/export")
def export_company(
    company_id: int,
    format: str = "json",
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("tenants.read", "security.write")),
):
    if format == "csv":
        csv_data = gdpr_service.export_tenant_csv(db, company_id)
        platform_audit_service.log(
            db, actor=current_user, action="gdpr.export_csv", target_type="company", target_id=company_id, request=request
        )
        return Response(content=csv_data, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=tenant-{company_id}.csv"})
    data = gdpr_service.export_tenant_data(db, company_id)
    platform_audit_service.log(
        db, actor=current_user, action="gdpr.export", target_type="company", target_id=company_id, request=request
    )
    return data


@router.get("/compliance/retention")
def get_retention(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("config.read", "security.read"))):
    return gdpr_service.get_retention_policy(db)


@router.put("/compliance/retention")
def put_retention(
    body: RetentionBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("config.write")),
):
    policy = gdpr_service.get_retention_policy(db)
    policy.update({k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None})
    out = gdpr_service.set_retention_policy(db, policy, current_user)
    platform_audit_service.log(db, actor=current_user, action="gdpr.retention_updated", target_type="config", after=policy, request=request)
    return out


@router.post("/compliance/purge")
def purge_logs(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("security.write")),
):
    return gdpr_service.purge_expired_logs(db, current_user)


@router.post("/companies/{company_id}/gdpr-delete")
def gdpr_delete(
    company_id: int,
    body: DeleteTenantBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("tenants.lock", "security.write")),
):
    return gdpr_service.delete_tenant_workflow(
        db,
        company_id,
        actor=current_user,
        confirm_name=body.confirm_name,
        hard_delete=body.hard_delete,
        request=request,
    )


@router.get("/suspicious")
def list_suspicious(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("security.read"))):
    return suspicious.list_suspicious(db)


@router.post("/suspicious/scan")
def scan_suspicious(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("security.write"))):
    return {"findings": suspicious.scan_suspicious_activity(db)}


@router.get("/password-policy")
def get_password_policy(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("config.read", "security.read"))):
    return ext.get_config(
        db,
        "password_policy",
        {
            "min_length": 9,
            "require_upper": True,
            "require_lower": True,
            "require_digit": True,
            "require_special": True,
            "max_age_days": None,
        },
    )


@router.put("/password-policy")
def put_password_policy(
    body: PasswordPolicyBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("config.write")),
):
    out = ext.set_config(db, "password_policy", body.model_dump(exclude_unset=True), actor=current_user, category="security")
    platform_audit_service.log(db, actor=current_user, action="config.password_policy", target_type="config", after=out, request=request)
    return out


@router.get("/maintenance")
def get_maintenance(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    return ext.get_config(db, "maintenance_mode", {"enabled": False, "message": None})


@router.put("/maintenance")
def put_maintenance(
    body: MaintenanceBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("config.write")),
):
    out = ext.set_config(
        db,
        "maintenance_mode",
        {"enabled": body.enabled, "message": body.message},
        actor=current_user,
        category="ops",
    )
    platform_audit_service.log(db, actor=current_user, action="config.maintenance", target_type="config", after=out, request=request)
    return out


@router.get("/platform-role-assignments")
def role_assignments(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("config.read"))):
    return rbac.list_admin_role_assignments(db)


@router.post("/platform-role-assignments")
def assign_role(
    body: AssignRoleBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("config.write")),
):
    out = rbac.assign_platform_role(db, body.user_id, body.role_slug)
    platform_audit_service.log(
        db,
        actor=current_user,
        action="platform_role.assigned",
        target_type="user",
        target_id=body.user_id,
        after=out,
        request=request,
    )
    return out


@router.get("/reports/export")
def export_report(
    days: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("billing.read", "tenants.read")),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=max(1, min(days, 365)))
    companies = db.query(Company).all()
    from app.models import SubscriptionInvoice, LoginLog, SupportTicket, ErrorLog

    invoices = db.query(SubscriptionInvoice).filter(SubscriptionInvoice.created_at >= since).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["metric", "value"])
    w.writerow(["period_days", days])
    w.writerow(["total_tenants", len(companies)])
    w.writerow(["active_tenants", sum(1 for c in companies if c.subscription_status == "active")])
    w.writerow(["revenue_collected", round(sum(float(i.amount_paid or 0) for i in invoices), 2)])
    w.writerow(["invoices", len(invoices)])
    w.writerow(["logins", db.query(LoginLog).filter(LoginLog.login_at >= since).count()])
    w.writerow(["open_tickets", db.query(SupportTicket).filter(SupportTicket.status.in_(["open", "in_progress", "escalated"])).count()])
    w.writerow(["errors", db.query(ErrorLog).filter(ErrorLog.last_seen_at >= since).count()])
    w.writerow([])
    w.writerow(["company_id", "name", "tier", "status", "created_at"])
    for c in companies:
        w.writerow([c.id, c.name, c.subscription_tier, c.subscription_status, c.created_at])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=platform-report-{days}d.csv"},
    )


@router.get("/reports/timeseries")
def reports_timeseries(
    days: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("billing.read", "tenants.read")),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=max(1, min(days, 90)))
    from app.models import SubscriptionInvoice, LoginLog, SupportTicket

    day_keys = [(since + timedelta(days=i)).date().isoformat() for i in range(days + 1)]
    tenants = {d: 0 for d in day_keys}
    revenue = {d: 0.0 for d in day_keys}
    logins = {d: 0 for d in day_keys}
    tickets = {d: 0 for d in day_keys}
    for c in db.query(Company).filter(Company.created_at >= since).all():
        d = (c.created_at if c.created_at.tzinfo else c.created_at.replace(tzinfo=timezone.utc)).date().isoformat()
        if d in tenants:
            tenants[d] += 1
    for inv in db.query(SubscriptionInvoice).filter(SubscriptionInvoice.paid_at >= since).all():
        if not inv.paid_at:
            continue
        d = (inv.paid_at if inv.paid_at.tzinfo else inv.paid_at.replace(tzinfo=timezone.utc)).date().isoformat()
        if d in revenue:
            revenue[d] += float(inv.amount_paid or 0)
    for r in db.query(LoginLog).filter(LoginLog.login_at >= since).all():
        d = (r.login_at if r.login_at.tzinfo else r.login_at.replace(tzinfo=timezone.utc)).date().isoformat()
        if d in logins:
            logins[d] += 1
    for t in db.query(SupportTicket).filter(SupportTicket.created_at >= since).all():
        d = (t.created_at if t.created_at.tzinfo else t.created_at.replace(tzinfo=timezone.utc)).date().isoformat()
        if d in tickets:
            tickets[d] += 1
    return {
        "labels": day_keys,
        "new_tenants": [tenants[d] for d in day_keys],
        "revenue": [round(revenue[d], 2) for d in day_keys],
        "logins": [logins[d] for d in day_keys],
        "tickets": [tickets[d] for d in day_keys],
    }


@router.post("/jobs/sync-workers")
def sync_worker_jobs(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("ops.write"))):
    """Mirror known cron workers into BackgroundJob rows for visibility."""
    from app.models import BackgroundJob

    known = [
        ("scheduled_maintenance", "cron"),
        ("check_missed_patrols", "cron"),
        ("sweep_lone_worker", "cron"),
    ]
    created = 0
    for name, queue in known:
        exists = (
            db.query(BackgroundJob)
            .filter(BackgroundJob.job_name == name, BackgroundJob.status.in_(["queued", "running", "scheduled"]))
            .first()
        )
        if not exists:
            db.add(BackgroundJob(job_name=name, queue=queue, status="scheduled", payload_json=json.dumps({"source": "arq-cron"})))
            created += 1
    db.commit()
    return {"created": created, "jobs": [{"job_name": n, "queue": q} for n, q in known]}
