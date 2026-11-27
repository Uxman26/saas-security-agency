"""Detect missed clock-in / clock-out after a grace window and notify recipients.

Runs from the minute cron (`sweep_missed_attendance`). Mirrors the recipient and
dedupe patterns in ``shift_reminder_service`` so Tenant Admin / Controller /
linked staff get one push+inbox row per event.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models import AppNotification, Assignment, Attendance, Company, Guard, Site, User
from app.services.attendance_service import (
    CANCELLED_STATUSES,
    _assignment_shift_end_dt,
    _company_zone,
)
from app.services.company_service import get_company_by_user_id
from app.services.shift_reminder_service import (
    _oversight_user_ids,
    _staff_user_id,
    assignment_start_utc,
)

logger = logging.getLogger(__name__)

MISSED_GRACE_MINUTES = 5
# How long after the grace threshold we still attempt delivery (dedupe prevents repeats).
MISSED_NOTIFY_WINDOW_HOURS = 12
KIND_CLOCK_IN = "missed_clock_in"
KIND_CLOCK_OUT = "missed_clock_out"


def assignment_end_utc(assignment: Assignment, zone) -> Optional[datetime]:
    end = _assignment_shift_end_dt(assignment)
    if end is None:
        return None
    if end.tzinfo is None:
        return end.replace(tzinfo=zone).astimezone(timezone.utc)
    return end.astimezone(timezone.utc)


def should_flag_missed_clock_in(
    *,
    now_utc: datetime,
    start_utc: datetime,
    grace_minutes: int = MISSED_GRACE_MINUTES,
    window_hours: int = MISSED_NOTIFY_WINDOW_HOURS,
) -> bool:
    """True once start+grace has passed, until the notify window closes."""
    due = start_utc + timedelta(minutes=grace_minutes)
    until = due + timedelta(hours=window_hours)
    return due <= now_utc < until


def should_flag_missed_clock_out(
    *,
    now_utc: datetime,
    end_utc: datetime,
    grace_minutes: int = MISSED_GRACE_MINUTES,
    window_hours: int = MISSED_NOTIFY_WINDOW_HOURS,
) -> bool:
    due = end_utc + timedelta(minutes=grace_minutes)
    until = due + timedelta(hours=window_hours)
    return due <= now_utc < until


def sweep_missed_attendance(db: Session) -> dict:
    now_utc = datetime.now(timezone.utc)
    clock_in_sent = 0
    clock_out_sent = 0
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
        # Yesterday covers overnight ends that spill past midnight; tomorrow covers
        # early starts near midnight when the worker ticks slightly early in UTC.
        days = [today - timedelta(days=1), today, today + timedelta(days=1)]
        rows = (
            db.query(Assignment)
            .options(
                joinedload(Assignment.site),
                joinedload(Assignment.guard),
                joinedload(Assignment.attendances),
                joinedload(Assignment.rota_plan),
            )
            .join(Guard, Assignment.guard_id == Guard.id)
            .filter(Guard.company_id == company.id, Assignment.date.in_(days))
            .all()
        )
        for assignment in rows:
            if not _assignment_is_live(assignment):
                skipped += 1
                continue
            start_utc = assignment_start_utc(assignment, zone)
            end_utc = assignment_end_utc(assignment, zone)
            att = _attendance_for(assignment)

            if (
                start_utc is not None
                and should_flag_missed_clock_in(now_utc=now_utc, start_utc=start_utc)
            ):
                # Alert only — do not auto-write absent/no_show. Existing late
                # Clock-In, payroll, and inferred unmarked status stay authoritative.
                if _is_cancelled(att) or _has_confirmed_absence(att) or (att is not None and att.booked_at):
                    skipped += 1
                elif _notify(
                    db,
                    company=company,
                    assignment=assignment,
                    kind=KIND_CLOCK_IN,
                    zone=zone,
                    now_utc=now_utc,
                    scheduled_label=(assignment.shift_start or "").strip(),
                ):
                    clock_in_sent += 1

            if (
                end_utc is not None
                and should_flag_missed_clock_out(now_utc=now_utc, end_utc=end_utc)
            ):
                if _is_cancelled(att) or att is None or not att.booked_at or att.booked_off_at:
                    skipped += 1
                elif _notify(
                    db,
                    company=company,
                    assignment=assignment,
                    kind=KIND_CLOCK_OUT,
                    zone=zone,
                    now_utc=now_utc,
                    scheduled_label=(assignment.shift_end or "").strip(),
                ):
                    clock_out_sent += 1

    if clock_in_sent or clock_out_sent:
        db.commit()
    return {
        "missed_clock_in_sent": clock_in_sent,
        "missed_clock_out_sent": clock_out_sent,
        "skipped": skipped,
    }


def _assignment_is_live(assignment: Assignment) -> bool:
    """Skip draft/unpublished rota plan rows; standalone assignments still count.

    If ``rota_plan_id`` is set but the plan failed to join (hard-deleted / stale FK),
    still treat the assignment as live so missed Clock-In/Out is not silently zeroed.
    Soft-deleted and draft plans remain excluded.
    """
    plan = getattr(assignment, "rota_plan", None)
    if plan is None:
        return True
    if getattr(plan, "deleted_at", None) is not None:
        return False
    status = (getattr(plan, "status", None) or "").strip().lower()
    if status in ("published", "active", "live") or getattr(plan, "published_at", None) is not None:
        return True
    return False


def _attendance_for(assignment: Assignment) -> Optional[Attendance]:
    rows = list(getattr(assignment, "attendances", None) or [])
    if not rows:
        return None
    rows.sort(key=lambda r: r.id or 0)
    return rows[0]


def _is_cancelled(att: Optional[Attendance]) -> bool:
    if att is None:
        return False
    return (att.status or "").strip().lower() in CANCELLED_STATUSES


def _has_confirmed_absence(att: Optional[Attendance]) -> bool:
    """Manual absence / no-show already recorded — no missed Clock-In alert."""
    if att is None:
        return False
    return (att.status or "").strip().lower() in ("absent", "no_show")


def _already_sent(
    db: Session,
    *,
    company_id: int,
    user_id: int,
    assignment_id: int,
    kind: str,
    now_utc: datetime,
) -> bool:
    since = now_utc - timedelta(hours=36)
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


def _notify(
    db: Session,
    *,
    company: Company,
    assignment: Assignment,
    kind: str,
    zone,
    now_utc: datetime,
    scheduled_label: str,
) -> bool:
    from app.models import User
    from app.services import fcm_push_service

    guard = assignment.guard or db.query(Guard).filter(Guard.id == assignment.guard_id).first()
    if not guard:
        return False
    site = assignment.site
    if site is None and assignment.site_id:
        site = db.query(Site).filter(Site.id == assignment.site_id).first()
    site_name = site.name if site else "site"
    staff_name = (getattr(guard, "full_name", None) or getattr(guard, "name", None) or "Staff").strip()
    shift_date = assignment.date
    date_str = shift_date.isoformat() if shift_date else ""
    date_label = shift_date.strftime("%d/%m/%Y") if shift_date else date_str
    start = (assignment.shift_start or "").strip()
    end = (assignment.shift_end or "").strip()
    zone_key = getattr(zone, "key", "local")
    event = "Clock-In" if kind == KIND_CLOCK_IN else "Clock-Out"
    title = f"Missed {event}"
    when = scheduled_label or (start if kind == KIND_CLOCK_IN else end) or "scheduled time"
    staff_body = (
        f"Missed {event}: you have not clocked "
        f"{'in' if kind == KIND_CLOCK_IN else 'out'} for {site_name} on {date_label} "
        f"(scheduled {when}, {zone_key})."
    )
    oversight_body = (
        f"Missed {event}: {staff_name} at {site_name} on {date_label} "
        f"(scheduled {when}, {zone_key})."
    )

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
    for uid, body in recipients:
        if _already_sent(
            db,
            company_id=company.id,
            user_id=uid,
            assignment_id=assignment.id,
            kind=kind,
            now_utc=now_utc,
        ):
            continue
        row = AppNotification(
            company_id=company.id,
            user_id=uid,
            kind=kind,
            title=title,
            body=body[:500],
            entity_type="assignment",
            entity_id=assignment.id,
        )
        db.add(row)
        db.flush()
        delivered = True
        user = db.query(User).filter(User.id == uid).first()
        muted = bool(getattr(user, "notification_sound_muted", False))
        try:
            fcm_push_service.notify_after_app_notification(
                db,
                user_id=uid,
                notification_id=row.id,
                kind=kind,
                title=title,
                body=body[:500],
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
                    "missed_event": "clock_in" if kind == KIND_CLOCK_IN else "clock_out",
                },
            )
        except Exception:
            logger.exception("%s FCM failed assignment=%s user=%s", kind, assignment.id, uid)
    return delivered


def list_missed_attendance(
    db: Session,
    user_id: int,
    *,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = 500,
) -> dict:
    """Return unresolved missed Clock-In / Clock-Out rows for live (active) rotas.

    Active = published rota plan (or standalone assignment). A miss is counted once
    the 5-minute grace after scheduled start/end has passed and the book-on / book-off
    is still missing. Tenant + portal site/staff scope are applied.
    """
    from app.schemas import MissedAttendanceItem, MissedAttendanceSummary
    from app.services.portal_access import (
        filter_assignments_for_user,
        get_linked_guard,
        is_portal_role,
        is_staff_portal_user,
    )

    company = get_company_by_user_id(db, user_id)
    zone = _company_zone(company)
    now_utc = datetime.now(timezone.utc)
    local_today = now_utc.astimezone(zone).date()
    start = start_date or (local_today - timedelta(days=60))
    end = end_date or (local_today + timedelta(days=1))
    if end < start:
        start, end = end, start

    q = (
        db.query(Assignment)
        .options(
            joinedload(Assignment.site),
            joinedload(Assignment.guard),
            joinedload(Assignment.attendances),
            joinedload(Assignment.rota_plan),
        )
        .join(Guard, Assignment.guard_id == Guard.id)
        .join(Site, Assignment.site_id == Site.id)
        .filter(
            Guard.company_id == company.id,
            Assignment.date >= start,
            Assignment.date <= end,
        )
    )
    user = db.query(User).filter(User.id == user_id).first()
    # Staff / guard portal users: hard-scope to the linked guard only (never peers).
    if user and is_staff_portal_user(user):
        guard = get_linked_guard(db, user)
        if not guard:
            return MissedAttendanceSummary().model_dump()
        q = q.filter(Assignment.guard_id == guard.id)
    elif user and is_portal_role(user):
        q = filter_assignments_for_user(db, user, q)

    clock_ins: list[MissedAttendanceItem] = []
    clock_outs: list[MissedAttendanceItem] = []
    grace = timedelta(minutes=MISSED_GRACE_MINUTES)

    for assignment in q.order_by(Assignment.date.desc(), Assignment.id.desc()).all():
        if not _assignment_is_live(assignment):
            continue
        att = _attendance_for(assignment)
        if _is_cancelled(att):
            continue

        start_utc = assignment_start_utc(assignment, zone)
        end_utc = assignment_end_utc(assignment, zone)
        guard = assignment.guard
        site = assignment.site
        staff_name = (
            (getattr(guard, "full_name", None) or getattr(guard, "name", None) or "")
            if guard
            else ""
        ).strip()
        site_name = (site.name if site else "") or ""

        def _item(kind: str) -> MissedAttendanceItem:
            return MissedAttendanceItem(
                assignment_id=assignment.id,
                guard_id=assignment.guard_id,
                guard_name=staff_name,
                site_id=assignment.site_id,
                site_name=site_name,
                date=assignment.date,
                shift_start=(assignment.shift_start or None),
                shift_end=(assignment.shift_end or None),
                kind=kind,
                attendance_id=att.id if att else None,
            )

        if (
            start_utc is not None
            and now_utc >= (start_utc + grace)
            and not _has_confirmed_absence(att)
            and (att is None or not att.booked_at)
            and len(clock_ins) < limit
        ):
            clock_ins.append(_item(KIND_CLOCK_IN))

        if (
            end_utc is not None
            and now_utc >= (end_utc + grace)
            and att is not None
            and att.booked_at
            and not att.booked_off_at
            and len(clock_outs) < limit
        ):
            clock_outs.append(_item(KIND_CLOCK_OUT))

        if len(clock_ins) >= limit and len(clock_outs) >= limit:
            break

    return MissedAttendanceSummary(
        missed_clock_in_count=len(clock_ins),
        missed_clock_out_count=len(clock_outs),
        missed_clock_ins=clock_ins,
        missed_clock_outs=clock_outs,
    ).model_dump()


__all__ = [
    "MISSED_GRACE_MINUTES",
    "KIND_CLOCK_IN",
    "KIND_CLOCK_OUT",
    "assignment_end_utc",
    "should_flag_missed_clock_in",
    "should_flag_missed_clock_out",
    "sweep_missed_attendance",
    "list_missed_attendance",
]
