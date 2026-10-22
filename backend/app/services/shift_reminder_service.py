from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models import AppNotification, Assignment, Attendance, Company, Guard, Site
from app.services.attendance_service import (
    CANCELLED_STATUSES,
    EARLY_BOOK_ON_MINUTES,
    _assignment_shift_start_dt,
    _company_zone,
)

logger = logging.getLogger(__name__)

SHIFT_REMINDER_MINUTES = EARLY_BOOK_ON_MINUTES


def assignment_start_utc(assignment: Assignment, zone) -> Optional[datetime]:
    start = _assignment_shift_start_dt(assignment)
    if start is None:
        return None
    if start.tzinfo is None:
        return start.replace(tzinfo=zone).astimezone(timezone.utc)
    return start.astimezone(timezone.utc)


def should_send_shift_reminder(
    *,
    now_utc: datetime,
    start_utc: datetime,
    reminder_minutes: int = SHIFT_REMINDER_MINUTES,
) -> bool:
    reminder_at = start_utc - timedelta(minutes=reminder_minutes)
    return reminder_at <= now_utc < start_utc


def sweep_shift_reminders(db: Session) -> dict:
    now_utc = datetime.now(timezone.utc)
    sent = 0
    skipped = 0
    companies = (
        db.query(Company)
        .filter((Company.account_status == None) | (Company.account_status == "active"))  # noqa: E711
        .all()
    )
    for company in companies:
        zone = _company_zone(company)
        local_now = now_utc.astimezone(zone)
        today = local_now.date()
        days = [today, today + timedelta(days=1)]
        rows = (
            db.query(Assignment)
            .options(
                joinedload(Assignment.site),
                joinedload(Assignment.guard),
                joinedload(Assignment.attendances),
            )
            .join(Guard, Assignment.guard_id == Guard.id)
            .filter(Guard.company_id == company.id, Assignment.date.in_(days))
            .all()
        )
        for assignment in rows:
            start_utc = assignment_start_utc(assignment, zone)
            if start_utc is None:
                skipped += 1
                continue
            if not should_send_shift_reminder(now_utc=now_utc, start_utc=start_utc):
                continue
            att = _attendance_for(assignment)
            if att is not None:
                status = (att.status or "").strip().lower()
                if status in CANCELLED_STATUSES or att.booked_at or att.booked_off_at:
                    skipped += 1
                    continue
            start_hm = (assignment.shift_start or "")[:5]
            if _already_sent(db, company.id, assignment, start_hm, now_utc):
                skipped += 1
                continue
            if _send_one(db, company, assignment, start_utc, zone):
                sent += 1
                logger.info(
                    "shift_reminder assignment=%s intended_utc=%s local=%s now_utc=%s tz=%s",
                    assignment.id,
                    start_utc.isoformat(),
                    start_utc.astimezone(zone).isoformat(),
                    now_utc.isoformat(),
                    getattr(zone, "key", str(zone)),
                )
    if sent:
        db.commit()
    return {"sent": sent, "skipped": skipped}


def _attendance_for(assignment: Assignment) -> Optional[Attendance]:
    rows = list(getattr(assignment, "attendances", None) or [])
    if not rows:
        return None
    rows.sort(key=lambda r: r.id or 0)
    return rows[0]


def _already_sent(db: Session, company_id: int, assignment: Assignment, start_hm: str, now_utc: datetime) -> bool:
    since = now_utc - timedelta(hours=18)
    rows = (
        db.query(AppNotification)
        .filter(
            AppNotification.company_id == company_id,
            AppNotification.kind == "shift_reminder",
            AppNotification.entity_type == "assignment",
            AppNotification.entity_id == assignment.id,
            AppNotification.created_at >= since,
        )
        .all()
    )
    for row in rows:
        body = (row.body or "")
        if not start_hm or start_hm in body:
            return True
    return False


def _send_one(db: Session, company: Company, assignment: Assignment, start_utc: datetime, zone) -> bool:
    from app.services import email_trigger_service, fcm_push_service, membership_service, sms_trigger_service
    from app.services.portal_access import get_linked_guard, is_staff_portal_user

    guard = assignment.guard or db.query(Guard).filter(Guard.id == assignment.guard_id).first()
    if not guard:
        return False
    site = assignment.site
    if site is None and assignment.site_id:
        site = db.query(Site).filter(Site.id == assignment.site_id).first()
    site_name = site.name if site else "site"
    local_start = start_utc.astimezone(zone)
    date_str = assignment.date.isoformat() if assignment.date else local_start.date().isoformat()
    start = (assignment.shift_start or local_start.strftime("%H:%M")).strip()
    end = (assignment.shift_end or "").strip()
    shift = f"{start}–{end}" if start and end else start or "scheduled"
    title = "Shift reminder"
    body = f"Your shift at {site_name} starts at {start} ({getattr(zone, 'key', 'local')})."

    uid = next(iter(membership_service.user_ids_for_guard(db, company.id, guard.id)), None)
    if uid is None:
        for user in membership_service.users_in_company(db, company.id):
            if not is_staff_portal_user(user):
                continue
            linked = get_linked_guard(db, user)
            if linked and linked.id == guard.id:
                uid = user.id
                break

    if uid:
        row = AppNotification(
            company_id=company.id,
            user_id=uid,
            kind="shift_reminder",
            title=title,
            body=body[:500],
            entity_type="assignment",
            entity_id=assignment.id,
        )
        db.add(row)
        db.flush()
        try:
            fcm_push_service.notify_after_app_notification(
                db,
                user_id=uid,
                notification_id=row.id,
                kind="shift_reminder",
                title=title,
                body=body[:500],
                entity_type="assignment",
                entity_id=assignment.id,
            )
        except Exception:
            logger.exception("shift_reminder FCM failed assignment=%s user=%s", assignment.id, uid)

    actor_id = uid or company.admin_id
    if actor_id:
        try:
            email_trigger_service._safe_send(
                db,
                actor_id,
                email_trigger_service._guard_email(guard),
                title,
                "shift_reminder",
                date=date_str,
                site=site_name,
                shift=shift,
            )
        except Exception:
            logger.exception("shift_reminder email failed assignment=%s", assignment.id)
        try:
            sms_trigger_service._safe_send(
                db,
                actor_id,
                sms_trigger_service._guard_phone(guard),
                "shift_reminder",
                date=date_str,
                site=site_name,
                shift=shift,
            )
        except Exception:
            logger.exception("shift_reminder SMS failed assignment=%s", assignment.id)
    return True
