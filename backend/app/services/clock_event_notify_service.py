"""Notify Tenant Admins / Controllers when staff successfully Clock In or Out.

Event-driven from ``attendance_service.book_on_off`` — not a cron — so load stays
tied to real attendance changes. Reuses oversight recipient selection and the same
AppNotification + FCM + dedupe pattern as missed-attendance alerts.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppNotification, Assignment, Company, Guard, Site
from app.services.attendance_service import _company_zone
from app.services.shift_reminder_service import _oversight_user_ids

logger = logging.getLogger(__name__)

KIND_CLOCK_IN = "clock_in"
KIND_CLOCK_OUT = "clock_out"
_DEDUPE_HOURS = 36


def notify_oversight_clock_event(
    db: Session,
    *,
    company: Company,
    assignment: Assignment,
    book_off: bool,
    event_at_utc: datetime,
    actor_user_id: Optional[int] = None,
    late: bool = False,
    early_finish: bool = False,
    overtime: bool = False,
) -> int:
    """Create inbox + FCM rows for oversight users. Returns number of recipients notified."""
    from app.models import User
    from app.services import fcm_push_service

    kind = KIND_CLOCK_OUT if book_off else KIND_CLOCK_IN
    now_utc = datetime.now(timezone.utc)
    if event_at_utc.tzinfo is None:
        event_at_utc = event_at_utc.replace(tzinfo=timezone.utc)

    guard = assignment.guard or db.query(Guard).filter(Guard.id == assignment.guard_id).first()
    if not guard:
        return 0
    site = assignment.site
    if site is None and assignment.site_id:
        site = db.query(Site).filter(Site.id == assignment.site_id).first()
    site_name = (site.name if site else None) or "site"
    staff_name = (
        getattr(guard, "full_name", None) or getattr(guard, "name", None) or "Staff"
    ).strip()

    zone = _company_zone(company)
    zone_key = getattr(zone, "key", "local")
    local_event = event_at_utc.astimezone(zone)
    time_str = local_event.strftime("%H:%M")
    shift_date = assignment.date or local_event.date()
    date_str = shift_date.isoformat()
    date_label = shift_date.strftime("%d/%m/%Y")
    start = (assignment.shift_start or "").strip()
    end = (assignment.shift_end or "").strip()
    shift_span = f"{start or '—'}–{end or '—'}"

    action = "Clocked Out" if book_off else "Clocked In"
    title = f"Staff {action}"
    qualifier = ""
    if not book_off and late:
        qualifier = " (late)"
    elif book_off and early_finish:
        qualifier = " (early finish)"
    elif book_off and overtime:
        qualifier = " (overtime)"
    body = (
        f"{staff_name} {action.lower()}{qualifier} at {site_name} · {date_label} · "
        f"shift {shift_span} · at {time_str} ({zone_key})"
    )[:500]

    recipients: list[int] = []
    seen: set[int] = set()
    for uid in _oversight_user_ids(db, company, assignment.site_id):
        if actor_user_id is not None and uid == actor_user_id:
            continue
        if uid in seen:
            continue
        if _already_sent(
            db,
            company_id=company.id,
            user_id=uid,
            assignment_id=assignment.id,
            kind=kind,
            now_utc=now_utc,
        ):
            continue
        recipients.append(uid)
        seen.add(uid)
    if not recipients:
        return 0

    delivered = 0
    for uid in recipients:
        row = AppNotification(
            company_id=company.id,
            user_id=uid,
            kind=kind,
            title=title,
            body=body,
            entity_type="assignment",
            entity_id=assignment.id,
        )
        db.add(row)
        db.flush()
        delivered += 1
        user = db.query(User).filter(User.id == uid).first()
        muted = bool(getattr(user, "notification_sound_muted", False))
        try:
            fcm_push_service.notify_after_app_notification(
                db,
                user_id=uid,
                notification_id=row.id,
                kind=kind,
                title=title,
                body=body,
                entity_type="assignment",
                entity_id=assignment.id,
                sound=not muted,
                tag=f"{kind}-{assignment.id}",
                data={
                    "type": kind,
                    "shift_date": date_str,
                    "shift_start": start,
                    "shift_end": end,
                    "site": site_name,
                    "staff": staff_name,
                    "timezone": zone_key,
                    "event_at": local_event.isoformat(),
                    "clock_event": "clock_out" if book_off else "clock_in",
                },
            )
        except Exception:
            logger.exception("%s FCM failed assignment=%s user=%s", kind, assignment.id, uid)
    return delivered


def _already_sent(
    db: Session,
    *,
    company_id: int,
    user_id: int,
    assignment_id: int,
    kind: str,
    now_utc: datetime,
) -> bool:
    since = now_utc - timedelta(hours=_DEDUPE_HOURS)
    return (
        db.query(AppNotification.id)
        .filter(
            AppNotification.company_id == company_id,
            AppNotification.user_id == user_id,
            AppNotification.kind == kind,
            AppNotification.entity_type == "assignment",
            AppNotification.entity_id == assignment_id,
            AppNotification.created_at >= since,
        )
        .first()
        is not None
    )


__all__ = [
    "KIND_CLOCK_IN",
    "KIND_CLOCK_OUT",
    "notify_oversight_clock_event",
]
