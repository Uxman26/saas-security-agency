from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models import (
    AppNotification,
    Assignment,
    Guard,
    PatrolAlert,
    PatrolCheckpoint,
    PatrolOccurrence,
    PatrolRoute,
    PatrolSession,
    Site,
    User,
)
from app.services.geo_utils import haversine_m

OPEN_STATUSES = ("scheduled", "reminder_sent", "due")
DONE_STATUSES = ("completed", "completed_late", "failed_gps", "missed")


def _parse_hm(s: str) -> time:
    parts = (s or "00:00").split(":")
    return time(int(parts[0]) % 24, int(parts[1]) % 60 if len(parts) > 1 else 0)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def slot_datetimes_for_day(day: date, start_hm: str, end_hm: str, frequency_minutes: int) -> list[datetime]:
    """Scheduled UTC-naive wall times for one calendar day, then tagged as UTC."""
    freq = max(int(frequency_minutes or 60), 5)
    a, b = _parse_hm(start_hm), _parse_hm(end_hm)
    out: list[datetime] = []
    if a <= b:
        cur = datetime.combine(day, a, tzinfo=timezone.utc)
        end = datetime.combine(day, b, tzinfo=timezone.utc)
        while cur <= end:
            out.append(cur)
            cur += timedelta(minutes=freq)
        return out
    # Overnight: day start → midnight, then midnight → end on next calendar day is handled by calling for both days;
    # for this day produce from start to 23:59 and from 00:00 to end when day is the "end" day.
    cur = datetime.combine(day, a, tzinfo=timezone.utc)
    end_night = datetime.combine(day, time(23, 59), tzinfo=timezone.utc)
    while cur <= end_night:
        out.append(cur)
        cur += timedelta(minutes=freq)
    cur = datetime.combine(day, time(0, 0), tzinfo=timezone.utc)
    end_morn = datetime.combine(day, b, tzinfo=timezone.utc)
    while cur <= end_morn:
        if cur not in out:
            out.append(cur)
        cur += timedelta(minutes=freq)
    return sorted(set(out))


def _guards_for_route(db: Session, route: PatrolRoute, when: datetime) -> list[tuple[int, Optional[int], Optional[int]]]:
    """Return (guard_id, session_id, assignment_id) covering the slot."""
    day = when.date()
    found: dict[int, tuple[Optional[int], Optional[int]]] = {}
    sessions = (
        db.query(PatrolSession)
        .filter(
            PatrolSession.route_id == route.id,
            PatrolSession.status == "active",
        )
        .all()
    )
    for s in sessions:
        found[s.guard_id] = (s.id, s.assignment_id)
    assignments = (
        db.query(Assignment)
        .filter(Assignment.site_id == route.site_id, Assignment.date == day)
        .all()
    )
    for a in assignments:
        if a.guard_id not in found:
            found[a.guard_id] = (None, a.id)
    return [(gid, sess, asg) for gid, (sess, asg) in found.items()]


def ensure_upcoming_occurrences(db: Session, *, horizon_hours: int = 24) -> int:
    """Create missing scheduled slots for active routes and assigned/session guards."""
    now = datetime.now(timezone.utc)
    until = now + timedelta(hours=horizon_hours)
    created = 0
    routes = (
        db.query(PatrolRoute)
        .options(joinedload(PatrolRoute.checkpoints))
        .filter(PatrolRoute.status == "active", PatrolRoute.deleted_at.is_(None))
        .all()
    )
    days = {now.date(), (now + timedelta(days=1)).date()}
    for route in routes:
        cps = [c for c in (route.checkpoints or []) if c.status == "active"]
        if not cps:
            continue
        slots: list[datetime] = []
        for day in sorted(days):
            slots.extend(slot_datetimes_for_day(day, route.start_time, route.end_time, route.frequency_minutes))
        grace = int(route.grace_minutes or 15)
        slots = [s for s in slots if now - timedelta(minutes=grace) <= s <= until]
        if not slots:
            continue
        # Cache guards once per calendar day (not per slot) and load existing keys in one query.
        guards_by_day: dict[date, list[tuple[int, Optional[int], Optional[int]]]] = {}
        for day in {s.date() for s in slots}:
            guards_by_day[day] = _guards_for_route(
                db, route, datetime.combine(day, time.min, tzinfo=timezone.utc)
            )
        slot_min, slot_max = min(slots), max(slots)
        existing = {
            (cp_id, g_id, _aware(sched))
            for cp_id, g_id, sched in (
                db.query(
                    PatrolOccurrence.checkpoint_id,
                    PatrolOccurrence.guard_id,
                    PatrolOccurrence.scheduled_at,
                )
                .filter(
                    PatrolOccurrence.route_id == route.id,
                    PatrolOccurrence.scheduled_at >= slot_min,
                    PatrolOccurrence.scheduled_at <= slot_max,
                )
                .all()
            )
        }
        for scheduled_at in slots:
            guards = guards_by_day.get(scheduled_at.date()) or []
            if not guards:
                continue
            for guard_id, session_id, assignment_id in guards:
                for cp in cps:
                    key = (cp.id, guard_id, _aware(scheduled_at))
                    if key in existing:
                        continue
                    db.add(
                        PatrolOccurrence(
                            company_id=route.company_id,
                            site_id=route.site_id,
                            route_id=route.id,
                            checkpoint_id=cp.id,
                            guard_id=guard_id,
                            session_id=session_id,
                            assignment_id=assignment_id,
                            scheduled_at=scheduled_at,
                            status="scheduled",
                        )
                    )
                    existing.add(key)
                    created += 1
    if created:
        db.commit()
    return created


def _push_app_notification(
    db: Session,
    *,
    company_id: int,
    user_id: int,
    kind: str,
    title: str,
    body: str,
    entity_type: str,
    entity_id: int,
) -> None:
    notif = AppNotification(
        company_id=company_id,
        user_id=user_id,
        kind=kind,
        title=title,
        body=body[:500],
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(notif)
    db.flush()
    try:
        from app.services import fcm_push_service

        fcm_push_service.notify_after_app_notification(
            db,
            user_id=user_id,
            notification_id=notif.id,
            kind=kind,
            title=title,
            body=body[:500],
            entity_type=entity_type,
            entity_id=entity_id,
        )
    except Exception:
        pass


def _notify_guard(db: Session, *, company_id: int, guard_id: int, title: str, body: str, occurrence_id: int) -> None:
    from sqlalchemy import func

    from app.services import membership_service

    ids = membership_service.user_ids_for_guard(db, company_id, guard_id)
    user = db.query(User).filter(User.id.in_(ids)).first() if ids else None
    if not user:
        guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company_id).first()
        email = (guard.email or "").lower().strip() if guard else ""
        if email:
            user = db.query(User).filter(func.lower(User.email) == email).first()
            if user and not membership_service.belongs_to_company(db, user, company_id):
                user = None
    if not user:
        return
    since = datetime.now(timezone.utc) - timedelta(hours=6)
    dup = (
        db.query(AppNotification.id)
        .filter(
            AppNotification.company_id == company_id,
            AppNotification.user_id == user.id,
            AppNotification.kind == "patrol_reminder",
            AppNotification.entity_id == occurrence_id,
            AppNotification.created_at >= since,
        )
        .first()
    )
    if dup:
        return
    _push_app_notification(
        db,
        company_id=company_id,
        user_id=user.id,
        kind="patrol_reminder",
        title=title,
        body=body,
        entity_type="patrol_occurrence",
        entity_id=occurrence_id,
    )


def _notify_supervisors(
    db: Session,
    *,
    company_id: int,
    title: str,
    body: str,
    occurrence_id: int,
    kind: str = "patrol_missed",
    entity_type: str = "patrol_occurrence",
) -> None:
    users = (
        db.query(User)
        .filter(
            User.company_id == company_id,
            User.role.in_(("company_admin", "manager", "supervisor", "admin")),
        )
        .limit(8)
        .all()
    )
    now = datetime.now(timezone.utc)
    for u in users:
        dup = (
            db.query(AppNotification.id)
            .filter(
                AppNotification.company_id == company_id,
                AppNotification.user_id == u.id,
                AppNotification.kind == kind,
                AppNotification.entity_type == entity_type,
                AppNotification.entity_id == occurrence_id,
                AppNotification.created_at >= now - timedelta(hours=12),
            )
            .first()
        )
        if dup:
            continue
        _push_app_notification(
            db,
            company_id=company_id,
            user_id=u.id,
            kind=kind,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=occurrence_id,
        )


def notify_failed_gps_scan(
    db: Session,
    *,
    company_id: int,
    guard: Guard,
    checkpoint: PatrolCheckpoint,
    route: PatrolRoute,
    log_id: int,
    notes: str,
) -> None:
    if not route:
        return
    site_name = ""
    if route.site:
        site_name = route.site.name or ""
    guard_name = getattr(guard, "name", None) or f"Guard #{guard.id}"
    msg = (
        f"Invalid / out-of-range patrol scan by {guard_name} — "
        f"Site: {site_name or '—'}; "
        f"Point: {checkpoint.name if checkpoint else '—'} "
        f"({checkpoint.code if checkpoint else ''}). {notes}"
    )
    now = datetime.now(timezone.utc)
    db.add(
        PatrolAlert(
            company_id=company_id,
            route_id=route.id,
            checkpoint_id=checkpoint.id if checkpoint else None,
            session_id=None,
            guard_id=guard.id,
            occurrence_id=None,
            alert_type="failed_gps",
            message=msg[:500],
            window_start=now,
            window_end=now,
            notified_at=now,
        )
    )
    _notify_supervisors(
        db,
        company_id=company_id,
        title="Patrol GPS verification failed",
        body=msg,
        occurrence_id=log_id,
        kind="patrol_failed_gps",
        entity_type="patrol_log",
    )


_SWEEP_LOCK_KEY = "lock:sweep_patrol_schedule"


def _try_sweep_lock(ttl_seconds: int = 240) -> bool:
    """Redis NX lock so overlapping minute crons do not double-process.

    Fail-closed when Redis is unavailable: arq unique=True still gates enqueue,
    but we must not run two heavy sweeps against the same DB work queue.
    """
    try:
        from redis import Redis

        from app.config import settings

        client = Redis.from_url(settings.redis_url, decode_responses=True)
        return bool(client.set(_SWEEP_LOCK_KEY, "1", nx=True, ex=ttl_seconds))
    except Exception:
        return False


def _release_sweep_lock() -> None:
    try:
        from redis import Redis

        from app.config import settings

        Redis.from_url(settings.redis_url, decode_responses=True).delete(_SWEEP_LOCK_KEY)
    except Exception:
        pass


def sweep_patrol_schedule(db: Session) -> dict:
    """Generate slots, send reminders, mark due/missed. Source of truth for status."""
    if not _try_sweep_lock():
        return {
            "skipped": True,
            "reason": "lock_held_or_redis_unavailable",
            "occurrences_created": 0,
            "reminders_sent": 0,
            "marked_due": 0,
            "missed": 0,
        }
    try:
        return _sweep_patrol_schedule_locked(db)
    finally:
        _release_sweep_lock()


def _sweep_patrol_schedule_locked(db: Session) -> dict:
    created = ensure_upcoming_occurrences(db, horizon_hours=24)
    now = datetime.now(timezone.utc)
    reminders = 0
    marked_due = 0
    missed = 0

    # Bound the working set so stale open rows cannot starve newer due/missed work.
    window_start = now - timedelta(days=2)
    window_end = now + timedelta(hours=36)
    open_rows = (
        db.query(PatrolOccurrence)
        .options(
            joinedload(PatrolOccurrence.checkpoint),
            joinedload(PatrolOccurrence.route),
            joinedload(PatrolOccurrence.site),
            joinedload(PatrolOccurrence.guard),
        )
        .filter(
            PatrolOccurrence.status.in_(OPEN_STATUSES),
            PatrolOccurrence.scheduled_at >= window_start,
            PatrolOccurrence.scheduled_at <= window_end,
        )
        .order_by(PatrolOccurrence.scheduled_at.asc())
        .limit(5000)
        .all()
    )
    for occ in open_rows:
        route = occ.route
        if not route or route.status != "active":
            continue
        scheduled = _aware(occ.scheduled_at)
        if not scheduled:
            continue
        reminder_mins = max(int(route.reminder_minutes or 10), 0)
        grace = max(int(route.grace_minutes or 15), 0)
        reminder_at = scheduled - timedelta(minutes=reminder_mins)
        miss_at = scheduled + timedelta(minutes=grace)

        if occ.reminder_sent_at is None and now >= reminder_at and now < miss_at:
            cp = occ.checkpoint
            site = occ.site
            title = "Patrol reminder"
            body = (
                f"Patrol due at {scheduled.strftime('%H:%M')} UTC — "
                f"Site: {site.name if site else '—'}; "
                f"Point: {cp.name if cp else '—'} ({cp.code if cp else ''}). "
                f"Scan the correct QR at the site within the allowed window."
            )
            _notify_guard(
                db,
                company_id=occ.company_id,
                guard_id=occ.guard_id,
                title=title,
                body=body,
                occurrence_id=occ.id,
            )
            occ.reminder_sent_at = now
            if occ.status == "scheduled":
                occ.status = "reminder_sent"
            reminders += 1

        if now >= scheduled and occ.status in ("scheduled", "reminder_sent"):
            occ.status = "due"
            marked_due += 1

        if now >= miss_at and occ.status in OPEN_STATUSES:
            occ.status = "missed"
            missed += 1
            cp = occ.checkpoint
            route_name = route.name if route else "route"
            msg = (
                f"Missed patrol at {scheduled.strftime('%Y-%m-%d %H:%M')} UTC — "
                f"{cp.name if cp else 'checkpoint'} on {route_name}"
            )
            alert = PatrolAlert(
                company_id=occ.company_id,
                route_id=occ.route_id,
                checkpoint_id=occ.checkpoint_id,
                session_id=occ.session_id,
                guard_id=occ.guard_id,
                occurrence_id=occ.id,
                alert_type="missed_patrol",
                message=msg,
                window_start=scheduled,
                window_end=miss_at,
                notified_at=now,
            )
            db.add(alert)
            _notify_supervisors(
                db,
                company_id=occ.company_id,
                title="Missed patrol",
                body=msg,
                occurrence_id=occ.id,
            )
            try:
                from app.services import email_service

                for u in (
                    db.query(User)
                    .filter(
                        User.company_id == occ.company_id,
                        User.role.in_(("company_admin", "manager", "supervisor", "admin")),
                    )
                    .limit(5)
                    .all()
                ):
                    if u.email:
                        email_service.send_email_async(u.email, "Missed patrol alert", msg)
            except Exception:
                pass

    db.commit()
    return {
        "occurrences_created": created,
        "reminders_sent": reminders,
        "marked_due": marked_due,
        "missed": missed,
    }


def match_open_occurrence(
    db: Session,
    *,
    checkpoint_id: int,
    guard_id: int,
    now: datetime,
    grace_minutes: int,
    early_minutes: int,
) -> Optional[PatrolOccurrence]:
    # Accept from early_minutes before scheduled until grace_minutes after
    window_start = now - timedelta(minutes=max(grace_minutes, 0))
    window_end = now + timedelta(minutes=max(early_minutes, 0))
    rows = (
        db.query(PatrolOccurrence)
        .filter(
            PatrolOccurrence.checkpoint_id == checkpoint_id,
            PatrolOccurrence.guard_id == guard_id,
            PatrolOccurrence.status.in_(OPEN_STATUSES),
            PatrolOccurrence.scheduled_at >= window_start,
            PatrolOccurrence.scheduled_at <= window_end,
        )
        .order_by(PatrolOccurrence.scheduled_at.asc())
        .all()
    )
    if not rows:
        return None
    return min(rows, key=lambda r: abs((_aware(r.scheduled_at) - now).total_seconds()))


def site_geofence_ok(site: Optional[Site], lat: float, lng: float, *, default_radius_m: float = 250.0) -> tuple[bool, Optional[float]]:
    if not site or site.latitude is None or site.longitude is None:
        return True, None
    radius = default_radius_m
    site_radius = getattr(site, "geofence_radius_m", None)
    if site_radius is not None:
        try:
            radius = float(site_radius)
        except (TypeError, ValueError):
            radius = default_radius_m
    dist = haversine_m(float(site.latitude), float(site.longitude), lat, lng)
    return dist <= radius, round(dist, 2)


def dashboard_kpis(db: Session, company_id: int, start: date, end: date) -> dict:
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end, time.max, tzinfo=timezone.utc)
    rows = (
        db.query(PatrolOccurrence)
        .filter(
            PatrolOccurrence.company_id == company_id,
            PatrolOccurrence.scheduled_at >= start_dt,
            PatrolOccurrence.scheduled_at <= end_dt,
            PatrolOccurrence.status != "cancelled",
        )
        .all()
    )
    total = len(rows)
    completed = sum(1 for r in rows if r.status in ("completed", "completed_late"))
    on_time = sum(1 for r in rows if r.status == "completed")
    late = sum(1 for r in rows if r.status == "completed_late")
    missed_n = sum(1 for r in rows if r.status == "missed")
    pending = sum(1 for r in rows if r.status in OPEN_STATUSES)
    late_vals = [float(r.late_minutes) for r in rows if r.late_minutes is not None]
    avg_late = round(sum(late_vals) / len(late_vals), 1) if late_vals else 0.0
    rate = round(100.0 * completed / total, 1) if total else 100.0

    by_site: dict[int, dict] = {}
    by_guard: dict[int, dict] = {}
    for r in rows:
        s = by_site.setdefault(r.site_id, {"site_id": r.site_id, "missed": 0, "late": 0, "completed": 0})
        g = by_guard.setdefault(r.guard_id, {"guard_id": r.guard_id, "missed": 0, "late": 0, "completed": 0})
        if r.status == "missed":
            s["missed"] += 1
            g["missed"] += 1
        elif r.status == "completed_late":
            s["late"] += 1
            g["late"] += 1
        elif r.status == "completed":
            s["completed"] += 1
            g["completed"] += 1

    site_ids = list(by_site.keys())
    sites = {s.id: s.name for s in db.query(Site).filter(Site.id.in_(site_ids or [0])).all()}
    guard_ids = list(by_guard.keys())
    guards = {g.id: g.full_name for g in db.query(Guard).filter(Guard.id.in_(guard_ids or [0])).all()}
    for sid, row in by_site.items():
        row["site_name"] = sites.get(sid, "")
    for gid, row in by_guard.items():
        row["guard_name"] = guards.get(gid, "")

    return {
        "total_scheduled": total,
        "completed": completed,
        "on_time": on_time,
        "late": late,
        "missed": missed_n,
        "pending": pending,
        "average_lateness_minutes": avg_late,
        "completion_rate_pct": rate,
        "missed_by_site": sorted(by_site.values(), key=lambda x: -x["missed"])[:20],
        "missed_by_guard": sorted(by_guard.values(), key=lambda x: -x["missed"])[:20],
        "late_by_site": sorted(by_site.values(), key=lambda x: -x["late"])[:20],
        "late_by_guard": sorted(by_guard.values(), key=lambda x: -x["late"])[:20],
    }
