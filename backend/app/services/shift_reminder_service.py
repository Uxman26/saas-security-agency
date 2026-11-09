from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models import AppNotification, Assignment, Attendance, Company, Guard, Site
from app.services.attendance_service import (
    CANCELLED_STATUSES,
    _assignment_shift_start_dt,
    _company_zone,
)

logger = logging.getLogger(__name__)

SHIFT_REMINDER_MINUTES = 30
_OVERSIGHT_TOKENS = ("admin", "controller", "manager", "supervisor")
_PORTAL_SLUGS = {"client", "staff", "guard"}


def assignment_start_utc(assignment: Assignment, zone) -> Optional[datetime]:
    start = _assignment_shift_start_dt(assignment)
    if start is None:
        return None
    if start.tzinfo is None:
        return start.replace(tzinfo=zone).astimezone(timezone.utc)
    return start.astimezone(timezone.utc)


def is_shift_oversight_user(user) -> bool:
    if getattr(user, "is_active", True) is False:
        return False
    role_row = getattr(user, "role_row", None)
    slug = (getattr(role_row, "slug", None) or "").lower().strip()
    name = (getattr(role_row, "name", None) or "").lower()
    raw = (getattr(user, "role", None) or "").lower().strip()
    if slug in _PORTAL_SLUGS or raw in _PORTAL_SLUGS:
        return False
    blob = f"{slug} {name} {raw}"
    return any(token in blob for token in _OVERSIGHT_TOKENS)


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
            if _send_one(db, company, assignment, start_utc, zone, now_utc):
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


def _already_sent_to(db: Session, company_id: int, user_id: int, assignment_id: int, now_utc: datetime) -> bool:
    since = now_utc - timedelta(hours=18)
    return (
        db.query(AppNotification.id)
        .filter(
            AppNotification.company_id == company_id,
            AppNotification.user_id == user_id,
            AppNotification.kind == "shift_reminder",
            AppNotification.entity_type == "assignment",
            AppNotification.entity_id == assignment_id,
            AppNotification.created_at >= since,
        )
        .first()
        is not None
    )


def _oversight_user_ids(db: Session, company: Company, site_id: Optional[int]) -> list[int]:
    from app.services import membership_service
    from app.services.portal_access import pinned_site_ids

    ids: list[int] = []
    seen: set[int] = set()
    for user in membership_service.users_in_company(db, company.id):
        if user.id in seen or getattr(user, "is_active", True) is False:
            continue
        pinned = pinned_site_ids(db, user)
        if pinned is not None and site_id not in pinned and user.id != company.admin_id:
            continue
        if user.id == company.admin_id or is_shift_oversight_user(user):
            ids.append(user.id)
            seen.add(user.id)
    return ids


def _staff_user_id(db: Session, company: Company, guard: Guard) -> Optional[int]:
    from app.services import membership_service
    from app.services.portal_access import get_linked_guard, is_staff_portal_user

    uid = next(iter(membership_service.user_ids_for_guard(db, company.id, guard.id)), None)
    if uid is not None:
        return uid
    for user in membership_service.users_in_company(db, company.id):
        if not is_staff_portal_user(user):
            continue
        linked = get_linked_guard(db, user)
        if linked and linked.id == guard.id:
            return user.id
    return None


def _send_one(db: Session, company: Company, assignment: Assignment, start_utc: datetime, zone, now_utc: datetime) -> bool:
    from app.models import User
    from app.services import email_trigger_service, fcm_push_service, sms_trigger_service

    guard = assignment.guard or db.query(Guard).filter(Guard.id == assignment.guard_id).first()
    if not guard:
        return False
    site = assignment.site
    if site is None and assignment.site_id:
        site = db.query(Site).filter(Site.id == assignment.site_id).first()
    site_name = site.name if site else "site"
    local_start = start_utc.astimezone(zone)
    shift_date = assignment.date or local_start.date()
    date_str = shift_date.isoformat()
    date_label = shift_date.strftime("%d/%m/%Y")
    start = (assignment.shift_start or local_start.strftime("%H:%M")).strip()
    end = (assignment.shift_end or "").strip()
    shift = f"{start}–{end}" if start and end else start or "scheduled"
    zone_key = getattr(zone, "key", "local")
    staff_name = (getattr(guard, "full_name", None) or getattr(guard, "name", None) or "Staff").strip()
    title = "Shift reminder"
    staff_body = f"Your shift at {site_name} on {date_label} starts at {start} ({zone_key})."
    oversight_body = f"{staff_name} at {site_name} on {date_label} starts at {shift} ({zone_key})."

    staff_uid = _staff_user_id(db, company, guard)
    recipients: list[tuple[int, str]] = []
    seen: set[int] = set()
    if staff_uid:
        recipients.append((staff_uid, staff_body))
        seen.add(staff_uid)
    for uid in _oversight_user_ids(db, company, assignment.site_id):
        if uid in seen:
            continue
        recipients.append((uid, oversight_body))
        seen.add(uid)
    if not recipients:
        return False

    delivered = False
    staff_notified = False
    for uid, body in recipients:
        if _already_sent_to(db, company.id, uid, assignment.id, now_utc):
            continue
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
        delivered = True
        if uid == staff_uid:
            staff_notified = True
        user = db.query(User).filter(User.id == uid).first()
        muted = bool(getattr(user, "notification_sound_muted", False))
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
                sound=not muted,
                tag=f"shift30-{assignment.id}",
                data={
                    "shift_date": date_str,
                    "shift_start": start,
                    "shift_end": end,
                    "site": site_name,
                    "staff": staff_name,
                    "timezone": zone_key,
                },
            )
        except Exception:
            logger.exception("shift_reminder FCM failed assignment=%s user=%s", assignment.id, uid)

    if staff_notified and staff_uid:
        try:
            email_trigger_service._safe_send(
                db,
                staff_uid,
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
                staff_uid,
                sms_trigger_service._guard_phone(guard),
                "shift_reminder",
                date=date_str,
                site=site_name,
                shift=shift,
            )
        except Exception:
            logger.exception("shift_reminder SMS failed assignment=%s", assignment.id)
    return delivered
