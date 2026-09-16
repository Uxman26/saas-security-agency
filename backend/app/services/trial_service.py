from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.models import Company, SubscriptionChange, TrialExtension, TrialPeriod, User
from app.services import platform_audit_service
from app.services.admin_platform_ext_service import get_config, set_config

DEFAULT_TRIAL_CONFIG = {
    "default_days": 30,
    "allowed_days": [7, 14, 30, 60],
    "allow_repeat": False,
    "require_card": True,
    "reminder_days": [7, 3, 1],
    "eligible_tiers": ["basic", "starter", "standard", "premium", "enterprise"],
    "enabled": True,
}

SUBSCRIPTION_REQUIRED_ALLOW_PREFIXES = (
    "/auth/me",
    "/auth/logout",
    "/auth/logout-all",
    "/auth/company-logo",
    "/subscriptions",
    "/billing",
    "/stripe",
    "/company",
    "/receipts",
    "/modules",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def get_trial_config(db: Session) -> dict[str, Any]:
    cfg = get_config(db, "trial_config", DEFAULT_TRIAL_CONFIG) or {}
    merged = {**DEFAULT_TRIAL_CONFIG, **cfg}
    if not isinstance(merged.get("allowed_days"), list):
        merged["allowed_days"] = list(DEFAULT_TRIAL_CONFIG["allowed_days"])
    if not isinstance(merged.get("reminder_days"), list):
        merged["reminder_days"] = list(DEFAULT_TRIAL_CONFIG["reminder_days"])
    return merged


def update_trial_config(db: Session, payload: dict, actor: User) -> dict:
    cfg = get_trial_config(db)
    for k, v in payload.items():
        if k in DEFAULT_TRIAL_CONFIG and v is not None:
            cfg[k] = v
    days = int(cfg.get("default_days") or 30)
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="Default trial days must be between 1 and 365")
    cfg["default_days"] = days
    allowed = [int(x) for x in (cfg.get("allowed_days") or [])]
    if days not in allowed:
        allowed = sorted(set(allowed + [days]))
        cfg["allowed_days"] = allowed
    return set_config(db, "trial_config", cfg, actor=actor, category="billing")


def days_remaining(ends_at: datetime | None) -> Optional[int]:
    end = _aware(ends_at)
    if not end:
        return None
    delta = end - _now()
    if delta.total_seconds() <= 0:
        return 0
    return max(0, int(delta.total_seconds() // 86400) + (1 if delta.total_seconds() % 86400 else 0))


def active_trial_for_company(db: Session, company_id: int) -> TrialPeriod | None:
    return (
        db.query(TrialPeriod)
        .filter(TrialPeriod.company_id == company_id, TrialPeriod.status.in_(("active", "extended")))
        .order_by(TrialPeriod.id.desc())
        .first()
    )


def trial_history_for_company(db: Session, company_id: int) -> list[TrialPeriod]:
    return (
        db.query(TrialPeriod)
        .options(joinedload(TrialPeriod.extensions))
        .filter(TrialPeriod.company_id == company_id)
        .order_by(TrialPeriod.id.desc())
        .all()
    )


def has_prior_trial(db: Session, company_id: int) -> bool:
    return db.query(TrialPeriod.id).filter(TrialPeriod.company_id == company_id).first() is not None


def trial_days_for_tier(tier: str | None) -> int:
    from app.services import platform_plans_service

    return platform_plans_service.get_trial_days(tier or "basic")


def is_eligible_for_trial(db: Session, company: Company, *, force: bool = False, skip_card: bool = False) -> tuple[bool, str]:
    cfg = get_trial_config(db)
    if not cfg.get("enabled", True):
        return False, "Trials are disabled on this platform"
    tier = (company.subscription_tier or "basic").lower()
    eligible = [t.lower() for t in (cfg.get("eligible_tiers") or [])]
    if eligible and tier not in eligible:
        return False, f"Plan '{tier}' is not eligible for a trial"
    if company.subscription_status == "active" and not force:
        return False, "Company already has an active paid subscription"
    if active_trial_for_company(db, company.id):
        return False, "An active trial already exists"
    if not force and not cfg.get("allow_repeat") and has_prior_trial(db, company.id):
        return False, "This tenant has already used a trial; enable allow_repeat or force with a reason"
    if cfg.get("require_card") and not force and not skip_card:
        from app.services import stripe_subscription_service as stripe_svc

        if not stripe_svc.customer_has_card(company):
            return False, "Card verification required before starting a trial"
    return True, "eligible"


def _trial_out(t: TrialPeriod, company: Company | None = None) -> dict[str, Any]:
    actor_ids = {e.extended_by_user_id for e in (t.extensions or []) if e.extended_by_user_id}
    actors = {}
    if actor_ids:
        from sqlalchemy.orm import object_session

        sess = object_session(t)
        if sess:
            actors = {u.id: u for u in sess.query(User).filter(User.id.in_(actor_ids)).all()}
    return {
        "id": t.id,
        "company_id": t.company_id,
        "company_name": company.name if company else (t.company.name if t.company else None),
        "user_id": t.user_id,
        "plan_tier": t.plan_tier,
        "status": t.status,
        "source": t.source,
        "duration_days": t.duration_days,
        "started_at": t.started_at,
        "original_ends_at": t.original_ends_at,
        "ends_at": t.ends_at,
        "days_remaining": days_remaining(t.ends_at) if t.status in ("active", "extended") else 0,
        "granted_by_user_id": t.granted_by_user_id,
        "converted_at": t.converted_at,
        "expired_at": t.expired_at,
        "stripe_subscription_id": t.stripe_subscription_id,
        "notes": t.notes,
        "created_at": t.created_at,
        "extensions": [
            {
                "id": e.id,
                "previous_ends_at": e.previous_ends_at,
                "new_ends_at": e.new_ends_at,
                "extension_days": e.extension_days,
                "reason": e.reason,
                "extended_by_user_id": e.extended_by_user_id,
                "extended_by_email": (actors.get(e.extended_by_user_id).email if actors.get(e.extended_by_user_id) else None),
                "extended_by_name": (actors.get(e.extended_by_user_id).full_name if actors.get(e.extended_by_user_id) else None),
                "created_at": e.created_at,
            }
            for e in sorted(t.extensions or [], key=lambda x: x.id)
        ],
    }


def start_trial(
    db: Session,
    company_id: int,
    *,
    actor: User | None,
    duration_days: int | None = None,
    notes: str | None = None,
    source: str = "admin",
    force: bool = False,
    user_id: int | None = None,
    stripe_subscription_id: str | None = None,
    ends_at: datetime | None = None,
    request: Request | None = None,
) -> dict:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    days = int(duration_days if duration_days is not None else trial_days_for_tier(co.subscription_tier))
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="Duration must be between 1 and 365 days")
    ok, reason = is_eligible_for_trial(db, co, force=force)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    if force and not (notes and len(notes.strip()) >= 5):
        raise HTTPException(status_code=400, detail="Force-grant requires a reason (min 5 characters)")

    now = _now()
    ends = _aware(ends_at) if ends_at else now + timedelta(days=days)
    if ends_at and duration_days is None:
        days = max(1, int((ends - now).total_seconds() // 86400) or 1)
    before = {"subscription_status": co.subscription_status, "subscription_end": co.subscription_end}
    trial = TrialPeriod(
        company_id=co.id,
        user_id=user_id or co.admin_id,
        plan_tier=co.subscription_tier or "basic",
        status="active",
        source=source,
        duration_days=days,
        started_at=now,
        original_ends_at=ends,
        ends_at=ends,
        granted_by_user_id=actor.id if actor else None,
        stripe_subscription_id=stripe_subscription_id,
        notes=notes,
        reminder_sent_json="[]",
    )
    co.subscription_status = "trialing"
    co.subscription_start = now
    co.subscription_end = ends
    db.add(trial)
    db.add(
        SubscriptionChange(
            company_id=co.id,
            actor_user_id=actor.id if actor else None,
            change_type="start_trial",
            from_tier=co.subscription_tier,
            to_tier=co.subscription_tier,
            from_status=before["subscription_status"],
            to_status="trialing",
            note=notes,
        )
    )
    db.commit()
    db.refresh(trial)
    if actor:
        platform_audit_service.log(
            db,
            actor=actor,
            action="trial.started",
            target_type="trial",
            target_id=trial.id,
            target_label=co.name,
            company=co,
            before=before,
            after={"status": "trialing", "ends_at": ends.isoformat(), "days": days},
            note=notes,
            request=request,
        )
    return _trial_out(trial, co)


def extend_trial(
    db: Session,
    trial_id: int,
    *,
    actor: User,
    extension_days: int,
    reason: str,
    request: Request | None = None,
) -> dict:
    if extension_days < 1 or extension_days > 365:
        raise HTTPException(status_code=400, detail="Extension must be 1–90 days")
    if not reason or len(reason.strip()) < 5:
        raise HTTPException(status_code=400, detail="Reason required (min 5 characters)")
    trial = (
        db.query(TrialPeriod)
        .options(joinedload(TrialPeriod.extensions), joinedload(TrialPeriod.company))
        .filter(TrialPeriod.id == trial_id)
        .first()
    )
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    co = db.query(Company).filter(Company.id == trial.company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")

    prev_end = _aware(trial.ends_at) or _now()
    base = max(prev_end, _now())
    new_end = base + timedelta(days=extension_days)
    ext = TrialExtension(
        trial_id=trial.id,
        extended_by_user_id=actor.id,
        previous_ends_at=prev_end,
        new_ends_at=new_end,
        extension_days=extension_days,
        reason=reason.strip(),
    )
    trial.ends_at = new_end
    trial.status = "extended"
    trial.expired_at = None
    co.subscription_status = "trialing"
    co.subscription_end = new_end
    db.add(ext)
    db.add(
        SubscriptionChange(
            company_id=co.id,
            actor_user_id=actor.id,
            change_type="extend_trial",
            from_status=co.subscription_status,
            to_status="trialing",
            note=reason,
        )
    )
    db.commit()
    db.refresh(trial)
    platform_audit_service.log(
        db,
        actor=actor,
        action="trial.extended",
        target_type="trial",
        target_id=trial.id,
        target_label=co.name,
        company=co,
        before={"ends_at": prev_end.isoformat()},
        after={"ends_at": new_end.isoformat(), "days": extension_days},
        note=reason,
        request=request,
    )
    return _trial_out(trial, co)


def expire_trial(db: Session, trial: TrialPeriod, *, commit: bool = True, send_email: bool = False) -> None:
    co = db.query(Company).filter(Company.id == trial.company_id).first()
    trial.status = "expired"
    trial.expired_at = _now()
    if co and co.subscription_status == "trialing":
        co.subscription_status = "trial_expired"
    if commit:
        db.commit()
    if co:
        try:
            from app.services import stripe_subscription_service as stripe_svc

            stripe_svc.charge_trial_end(db, co)
            db.refresh(co)
        except Exception:
            pass
    if send_email and co and (co.subscription_status or "") != "active":
        _send_trial_expired_email(db, co, trial)


def _send_trial_expired_email(db: Session, company: Company, trial: TrialPeriod) -> None:
    try:
        from app.services.email_service import send_email, is_configured
        from app.services.admin_billing_notify_service import ensure_templates, render_template
        from app.models import NotificationTemplate, PlatformNotification

        if not is_configured():
            return
        ensure_templates(db)
        tmpl = db.query(NotificationTemplate).filter(NotificationTemplate.key == "trial_expired").first()
        admin = db.query(User).filter(User.id == (trial.user_id or company.admin_id)).first()
        if not admin or not admin.email:
            return
        subject = tmpl.subject if tmpl else "Your ControlOps trial has ended"
        body_src = (
            tmpl.body
            if tmpl
            else "The trial for {{company_name}} has ended. You can still sign in and upgrade from Billing."
        )
        body = render_template(
            body_src,
            {
                "company_name": company.name,
                "tier": trial.plan_tier,
                "ends_at": str(trial.ends_at),
            },
        )
        subject = render_template(subject, {"company_name": company.name})
        ok = send_email(admin.email, subject, body)
        db.add(
            PlatformNotification(
                company_id=company.id,
                user_id=admin.id,
                template_key="trial_expired",
                channel="email",
                subject=subject,
                body=body,
                status="sent" if ok else "failed",
                sent_at=_now() if ok else None,
            )
        )
        db.commit()
    except Exception:
        pass


def mark_trial_converted(db: Session, company_id: int) -> None:
    trial = active_trial_for_company(db, company_id)
    if not trial:
        trial = (
            db.query(TrialPeriod)
            .filter(TrialPeriod.company_id == company_id, TrialPeriod.status.in_(("active", "extended", "expired")))
            .order_by(TrialPeriod.id.desc())
            .first()
        )
    if trial and trial.status != "converted":
        trial.status = "converted"
        trial.converted_at = _now()
        db.commit()


def sync_expired_trials(db: Session) -> dict:
    now = _now()
    rows = (
        db.query(TrialPeriod)
        .filter(TrialPeriod.status.in_(("active", "extended")), TrialPeriod.ends_at <= now)
        .all()
    )
    for t in rows:
        expire_trial(db, t, commit=False, send_email=False)
    companies = db.query(Company).filter(Company.subscription_status == "trialing").all()
    orphan = 0
    orphan_companies = []
    for co in companies:
        end = _aware(co.subscription_end)
        if end and end <= now:
            co.subscription_status = "trial_expired"
            orphan += 1
            orphan_companies.append(co)
            try:
                from app.services import stripe_subscription_service as stripe_svc

                stripe_svc.charge_trial_end(db, co)
            except Exception:
                pass
    db.commit()
    for t in rows:
        co = db.query(Company).filter(Company.id == t.company_id).first()
        if co and (co.subscription_status or "") != "active":
            _send_trial_expired_email(db, co, t)
    for co in orphan_companies:
        db.refresh(co)
        if (co.subscription_status or "") == "active":
            continue
        fake = TrialPeriod(
            company_id=co.id,
            plan_tier=co.subscription_tier or "basic",
            status="expired",
            duration_days=0,
            started_at=co.subscription_start or now,
            original_ends_at=co.subscription_end or now,
            ends_at=co.subscription_end or now,
        )
        _send_trial_expired_email(db, co, fake)
    return {"expired_trials": len(rows), "orphan_companies": orphan}


def send_trial_reminders(db: Session) -> dict:
    from app.services.email_service import send_email, is_configured
    from app.services.admin_billing_notify_service import ensure_templates, render_template
    from app.models import NotificationTemplate, PlatformNotification

    cfg = get_trial_config(db)
    reminder_days = sorted({int(d) for d in (cfg.get("reminder_days") or [7, 3, 1])}, reverse=True)
    ensure_templates(db)
    tmpl = db.query(NotificationTemplate).filter(NotificationTemplate.key == "trial_expiring").first()
    sent = 0
    now = _now()
    rows = db.query(TrialPeriod).filter(TrialPeriod.status.in_(("active", "extended"))).all()
    for t in rows:
        remaining = days_remaining(t.ends_at)
        if remaining is None:
            continue
        already = []
        try:
            already = json.loads(t.reminder_sent_json or "[]")
        except (TypeError, ValueError):
            already = []
        for d in reminder_days:
            if remaining == d and d not in already:
                co = db.query(Company).filter(Company.id == t.company_id).first()
                admin = db.query(User).filter(User.id == (t.user_id or (co.admin_id if co else None))).first()
                subject = (tmpl.subject if tmpl else "Your ControlOps trial ends soon").replace(
                    "{{days}}", str(d)
                )
                body_src = (
                    tmpl.body
                    if tmpl
                    else "Your trial for {{company_name}} ends in {{days}} day(s) on {{ends_at}}. Upgrade to keep full access."
                )
                body = render_template(
                    body_src,
                    {
                        "company_name": co.name if co else "",
                        "days": d,
                        "ends_at": (_aware(t.ends_at) or now).date().isoformat(),
                        "tier": t.plan_tier,
                    },
                )
                row = PlatformNotification(
                    company_id=t.company_id,
                    user_id=admin.id if admin else None,
                    template_key="trial_expiring",
                    channel="email",
                    subject=subject,
                    body=body,
                    status="queued",
                )
                db.add(row)
                try:
                    if admin and admin.email and is_configured():
                        send_email(admin.email, subject, body)
                        row.status = "sent"
                        row.sent_at = now
                    else:
                        row.status = "queued"
                except Exception as e:
                    row.status = "failed"
                    row.error_message = str(e)[:500]
                already.append(d)
                t.reminder_sent_json = json.dumps(already)
                sent += 1
    db.commit()
    return {"reminders_sent": sent}


def tenant_trial_status(db: Session, company: Company) -> dict[str, Any]:
    """Public-facing trial snapshot for tenant UI banners."""
    sync_if_needed(db, company)
    trial = active_trial_for_company(db, company.id)
    if not trial:
        trial = (
            db.query(TrialPeriod)
            .filter(TrialPeriod.company_id == company.id)
            .order_by(TrialPeriod.id.desc())
            .first()
        )
    status = company.subscription_status or "pending"
    end = _aware(company.subscription_end) or (_aware(trial.ends_at) if trial else None)
    start = (_aware(trial.started_at) if trial else None) or _aware(company.subscription_start)
    remaining = days_remaining(end) if status == "trialing" else None
    label = {
        "trialing": "Trial Active",
        "trial_expired": "Trial Expired — Subscription Required",
        "active": "Paid Subscription",
        "pending": "Payment Pending",
    }.get(status, status.replace("_", " ").title())
    if status == "trialing" and trial and trial.status == "extended":
        label = "Trial Extended"
    return {
        "subscription_status": status,
        "label": label,
        "trial_active": status == "trialing",
        "trial_expired": status == "trial_expired",
        "trial_starts_on": start.isoformat() if start else None,
        "trial_ends_on": end.isoformat() if end and status in ("trialing", "trial_expired") else None,
        "original_ends_on": (_aware(trial.original_ends_at).isoformat() if trial and trial.original_ends_at else None),
        "days_remaining": remaining,
        "plan_tier": company.subscription_tier,
        "billing_cycle": company.billing_cycle,
        "trial_id": trial.id if trial else None,
        "duration_days": trial.duration_days if trial else None,
        "can_use_paid_features": status in ("active", "trialing"),
        "can_create_records": status in ("active", "trialing"),
        "can_edit_existing": status not in ("pending",),
        "subscription_required": status in ("trial_expired", "pending", "cancelled", "canceled", "suspended", "past_due", "locked", "unpaid"),
        "restriction": (
            "Adding new records and paid features are locked until the subscription is activated. You can still sign in, view, and edit existing data."
            if status in ("trial_expired", "cancelled", "canceled", "suspended", "past_due", "locked", "unpaid")
            else None
        ),
    }


def sync_if_needed(db: Session, company: Company) -> None:
    if company.subscription_status == "trialing":
        end = _aware(company.subscription_end)
        if end and end <= _now():
            trial = active_trial_for_company(db, company.id)
            if trial:
                expire_trial(db, trial)
            else:
                company.subscription_status = "trial_expired"
                db.commit()


def path_allowed_when_subscription_required(path: str, method: str | None = None) -> bool:
    p = (path or "").split("?")[0]
    if p.startswith("/api/"):
        p = p[4:]
    if any(p == prefix or p.startswith(prefix + "/") for prefix in SUBSCRIPTION_REQUIRED_ALLOW_PREFIXES):
        return True
    m = (method or "GET").upper()
    if m in ("GET", "HEAD", "OPTIONS"):
        return True
    if m in ("PATCH", "PUT", "DELETE"):
        return True
    return False


def list_trials(
    db: Session,
    *,
    status: str | None = None,
    company_id: int | None = None,
    limit: int = 200,
) -> list[dict]:
    q = db.query(TrialPeriod).options(joinedload(TrialPeriod.company), joinedload(TrialPeriod.extensions))
    if status:
        q = q.filter(TrialPeriod.status == status)
    if company_id:
        q = q.filter(TrialPeriod.company_id == company_id)
    rows = q.order_by(TrialPeriod.id.desc()).limit(min(limit, 500)).all()
    return [_trial_out(t, t.company) for t in rows]


def get_trial(db: Session, trial_id: int) -> dict:
    t = (
        db.query(TrialPeriod)
        .options(joinedload(TrialPeriod.company), joinedload(TrialPeriod.extensions))
        .filter(TrialPeriod.id == trial_id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Trial not found")
    return _trial_out(t, t.company)
