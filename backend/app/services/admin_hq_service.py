from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    ApiUsageLog,
    BackgroundJob,
    BillingReceipt,
    Company,
    CompanySubscription,
    ErrorLog,
    LoginLog,
    PaymentRefund,
    PlatformNotification,
    SecurityEvent,
    SubscriptionInvoice,
    SupportTicket,
    TrialPeriod,
    User,
    WebhookLog,
)
from app.services import platform_plans_service
from app.services import support_ticket_service as tickets
from app.services import tenant_usage_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def hq_snapshot(db: Session) -> dict[str, Any]:
    now = _now()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    companies = db.query(Company).all()

    active = [c for c in companies if (c.subscription_status or "") == "active"]
    trialing = [c for c in companies if (c.subscription_status or "") == "trialing"]
    trial_expired = [c for c in companies if (c.subscription_status or "") == "trial_expired"]
    past_due = [c for c in companies if (c.subscription_status or "") in ("past_due", "unpaid")]
    cancelled = [
        c for c in companies if (c.subscription_status or "") in ("cancelled", "canceled")
    ]
    locked = [c for c in companies if (getattr(c, "account_status", None) or "") == "locked"]

    mrr = 0.0
    for c in active:
        price = platform_plans_service.get_price(c.subscription_tier or "basic")
        if (c.billing_cycle or "monthly") == "yearly":
            mrr += price / 12.0
        else:
            mrr += price
    mrr = round(mrr, 2)
    arr = round(mrr * 12, 2)

    new_30d = sum(1 for c in companies if _aware(c.created_at) and _aware(c.created_at) >= month_ago)
    cancelled_30d = 0
    for c in cancelled:
        end = _aware(c.subscription_end) or _aware(c.updated_at)
        if end and end >= month_ago:
            cancelled_30d += 1
    churn_rate = round((cancelled_30d / max(1, len(active) + cancelled_30d)) * 100, 2)

    invoices = db.query(SubscriptionInvoice).all()
    collected = round(sum(float(i.amount_paid or 0) for i in invoices), 2)
    outstanding = round(
        sum(
            max(0.0, float(i.total_amount or 0) - float(i.amount_paid or 0))
            for i in invoices
            if (i.status or "") not in ("cancelled", "refunded")
        ),
        2,
    )
    failed_payments = (
        db.query(CompanySubscription).filter(CompanySubscription.status.in_(["past_due", "unpaid"])).count()
    )
    failed_billing_invoices = sum(1 for i in invoices if (i.status or "") in ("overdue", "unpaid") and float(i.amount_paid or 0) < float(i.total_amount or 0))

    refunds_completed = (
        db.query(PaymentRefund).filter(PaymentRefund.status == "completed").all()
    )
    refunds_pending = db.query(PaymentRefund).filter(
        PaymentRefund.status.in_(["pending_approval", "approved", "processing"])
    ).count()
    refunds_total = round(sum(float(r.processed_amount or r.amount or 0) for r in refunds_completed), 2)
    refunds_30d = round(
        sum(
            float(r.processed_amount or r.amount or 0)
            for r in refunds_completed
            if _aware(r.created_at) and _aware(r.created_at) >= month_ago
        ),
        2,
    )
    net_revenue = round(collected - refunds_total, 2)

    credit_liability = round(
        sum(float(getattr(c, "account_credit_balance", 0) or 0) for c in companies), 2
    )

    open_tickets = tickets.open_ticket_count(db)
    sla_breaches = tickets.sla_breach_count(db)
    critical_errors = (
        db.query(ErrorLog).filter(ErrorLog.severity == "critical", ErrorLog.status == "open").count()
    )
    failed_jobs = db.query(BackgroundJob).filter(BackgroundJob.status == "failed").count()
    queued_jobs = db.query(BackgroundJob).filter(BackgroundJob.status.in_(["queued", "running"])).count()
    webhook_failures = (
        db.query(WebhookLog)
        .filter(WebhookLog.status.in_(["failed", "error"]))
        .order_by(WebhookLog.id.desc())
        .limit(20)
        .all()
    )
    recent_webhooks = db.query(WebhookLog).order_by(WebhookLog.id.desc()).limit(10).all()
    notif_failed = (
        db.query(PlatformNotification).filter(PlatformNotification.status == "failed").count()
    )
    api_7d = db.query(ApiUsageLog).filter(ApiUsageLog.logged_at >= week_ago).count()
    logins_7d = db.query(LoginLog).filter(LoginLog.login_at >= week_ago).count()

    expiring = sum(
        1
        for c in active
        if c.subscription_end
        and _aware(c.subscription_end)
        and _aware(c.subscription_end) <= now + timedelta(days=14)
    )

    active_trials_rows = (
        db.query(TrialPeriod).filter(TrialPeriod.status.in_(["active", "extended"])).count()
    )

    by_tier: dict[str, int] = {}
    for c in companies:
        tier = c.subscription_tier or "unknown"
        by_tier[tier] = by_tier.get(tier, 0) + 1

    by_status: dict[str, int] = {}
    for c in companies:
        st = c.subscription_status or "unknown"
        by_status[st] = by_status.get(st, 0) + 1

    recent_security = db.query(SecurityEvent).order_by(SecurityEvent.id.desc()).limit(8).all()
    recent_refunds = (
        db.query(PaymentRefund).order_by(PaymentRefund.id.desc()).limit(8).all()
    )
    upcoming_renewals = []
    for c in active:
        end = _aware(c.subscription_end)
        if end and now <= end <= now + timedelta(days=14):
            upcoming_renewals.append(
                {
                    "company_id": c.id,
                    "company_name": c.name,
                    "subscription_end": end,
                    "tier": c.subscription_tier,
                    "billing_cycle": c.billing_cycle,
                }
            )
    upcoming_renewals.sort(key=lambda x: x["subscription_end"] or now)

    return {
        "generated_at": now,
        "tenants": {
            "total": len(companies),
            "active": len(active),
            "trialing": len(trialing),
            "trial_expired": len(trial_expired),
            "past_due": len(past_due),
            "cancelled": len(cancelled),
            "locked": len(locked),
            "new_7d": sum(1 for c in companies if _aware(c.created_at) and _aware(c.created_at) >= week_ago),
            "new_30d": new_30d,
            "expiring_14d": expiring,
            "by_tier": by_tier,
            "by_status": by_status,
            "active_users": db.query(User)
            .filter(User.is_active == True, User.company_id.isnot(None))
            .count(),
        },
        "billing": {
            "mrr": mrr,
            "arr": arr,
            "collected_all_time": collected,
            "outstanding": outstanding,
            "net_revenue": net_revenue,
            "refunds_total": refunds_total,
            "refunds_30d": refunds_30d,
            "refunds_pending": refunds_pending,
            "credit_liability": credit_liability,
            "failed_subscriptions": failed_payments,
            "failed_invoices": failed_billing_invoices,
            "churn_rate_30d_pct": churn_rate,
            "cancelled_30d": cancelled_30d,
            "billing_receipts": db.query(BillingReceipt).count(),
        },
        "trials": {
            "active_rows": active_trials_rows,
            "companies_trialing": len(trialing),
            "companies_expired": len(trial_expired),
        },
        "ops": {
            "open_tickets": open_tickets,
            "sla_breaches": sla_breaches,
            "critical_errors": critical_errors,
            "failed_jobs": failed_jobs,
            "queued_jobs": queued_jobs,
            "webhook_failure_count": len(webhook_failures),
            "notification_failures": notif_failed,
            "api_calls_7d": api_7d,
            "logins_7d": logins_7d,
            "platform_usage": tenant_usage_service.platform_usage_summary(db),
        },
        "lists": {
            "upcoming_renewals": upcoming_renewals[:20],
            "recent_security_events": [
                {
                    "id": e.id,
                    "event_type": e.event_type,
                    "severity": e.severity,
                    "message": e.message,
                    "created_at": e.created_at,
                }
                for e in recent_security
            ],
            "recent_refunds": [
                {
                    "id": r.id,
                    "company_id": r.company_id,
                    "amount": r.amount,
                    "status": r.status,
                    "created_at": r.created_at,
                }
                for r in recent_refunds
            ],
            "recent_webhooks": [
                {
                    "id": w.id,
                    "event_type": getattr(w, "event_type", None) or getattr(w, "provider", None),
                    "status": w.status,
                    "created_at": w.created_at,
                }
                for w in recent_webhooks
            ],
            "failed_webhooks": [
                {
                    "id": w.id,
                    "event_type": getattr(w, "event_type", None),
                    "status": w.status,
                    "error_message": getattr(w, "error_message", None),
                    "created_at": w.created_at,
                }
                for w in webhook_failures[:10]
            ],
        },
    }


def ops_health(db: Session) -> dict[str, Any]:
    snap = hq_snapshot(db)
    ops = snap["ops"]
    billing = snap["billing"]
    issues = []
    if ops["critical_errors"]:
        issues.append(f"{ops['critical_errors']} critical error(s) open")
    if ops["failed_jobs"]:
        issues.append(f"{ops['failed_jobs']} failed background job(s)")
    if ops["webhook_failure_count"]:
        issues.append(f"{ops['webhook_failure_count']} recent webhook failure(s)")
    if billing["failed_subscriptions"] or billing["failed_invoices"]:
        issues.append("Failed / overdue billing detected")
    if ops["sla_breaches"]:
        issues.append(f"{ops['sla_breaches']} support SLA breach(es)")
    status = "healthy" if not issues else ("degraded" if len(issues) < 3 else "critical")
    return {
        "status": status,
        "issues": issues,
        "ops": ops,
        "billing_alerts": {
            "failed_subscriptions": billing["failed_subscriptions"],
            "failed_invoices": billing["failed_invoices"],
            "refunds_pending": billing["refunds_pending"],
            "credit_liability": billing["credit_liability"],
        },
        "generated_at": snap["generated_at"],
    }
