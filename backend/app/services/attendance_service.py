import json
import logging
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
from typing import List, Optional
from datetime import datetime, date, timezone, timedelta, time
from zoneinfo import ZoneInfo
from app.models import Attendance, Assignment, Guard, Site, User, ShiftOvertimeLog, ShiftEarlyFinishLog, ShiftLateLog
from app.schemas import AttendanceCreate, BookingOnOff, AttendanceUpdate, AttendanceByShiftRequest, AttendanceResponse
from app.services.company_service import get_company_by_user_id
from app.services.shift_adjustment_service import find_assignment

logger = logging.getLogger(__name__)

# A cancelled shift is recorded as one of two statuses rather than a status plus a
# separate paid flag. Every consumer already branches on the status string alone — the
# payable set in payroll, the planner's status map, the report tallies — so splitting
# paid from unpaid here means none of them can read a paid cancellation as an unpaid one
# by forgetting to check a second field.
CANCELLED_UNPAID = "cancelled"
CANCELLED_PAID = "cancelled_paid"
CANCELLED_STATUSES = frozenset({CANCELLED_UNPAID, CANCELLED_PAID})

ALLOWED_STATUS = {
    "on_time",
    "late",
    "absent",
    "early_leave",
    "no_show",
    "present",
    CANCELLED_UNPAID,
    CANCELLED_PAID,
}
STATUS_ALIASES = {"present": "on_time", "cancelled_unpaid": CANCELLED_UNPAID}

NOTE_REQUIRED_DETAIL = "Note is required for Late, Absent, No show, and Cancelled"
EARLY_BOOK_ON_MINUTES = 20
# Late only after the scheduled start minute has fully passed (11:15 → late from 11:16).
LATE_GRACE = timedelta(minutes=1)
DEFAULT_COMPANY_TZ = "Europe/London"


def _company_zone(company) -> ZoneInfo:
    name = (getattr(company, "timezone", None) or DEFAULT_COMPANY_TZ).strip() or DEFAULT_COMPANY_TZ
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo(DEFAULT_COMPANY_TZ)


def _naive_company_now(company=None) -> datetime:
    """Wall-clock now in the tenant timezone (naive), matching shift start/end strings."""
    return datetime.now(_company_zone(company)).replace(tzinfo=None)


def is_late_clock_in(now: datetime, shift_start: datetime) -> bool:
    """True from the first minute after scheduled start (inclusive of HH:MM+1:00)."""
    now_n = now.replace(tzinfo=None) if now.tzinfo else now
    start_n = shift_start.replace(tzinfo=None) if shift_start.tzinfo else shift_start
    return now_n >= start_n + LATE_GRACE


def _assignment_shift_start_dt(assignment: Assignment):
    shift_start = getattr(assignment, "shift_start", None)
    day = getattr(assignment, "date", None)
    if not shift_start or not day:
        return None
    try:
        parts = str(shift_start).split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        return datetime.combine(day, time(h, m))
    except (ValueError, IndexError, TypeError):
        return None


def _assignment_shift_end_dt(assignment: Assignment):
    shift_end = getattr(assignment, "shift_end", None)
    day = getattr(assignment, "date", None)
    if not shift_end or not day:
        return None
    try:
        parts = str(shift_end).split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        end = datetime.combine(day, time(h, m))
        start = _assignment_shift_start_dt(assignment)
        if start is not None and end <= start:
            end = end + timedelta(days=1)
        return end
    except (ValueError, IndexError, TypeError):
        return None


def _hhmm(dt: datetime) -> str:
    return f"{dt.hour:02d}:{dt.minute:02d}"


def _site_location_label(site) -> str:
    if not site:
        return ""
    parts = [
        (getattr(site, "name", None) or "").strip(),
        (getattr(site, "address", None) or "").strip(),
        (getattr(site, "postcode", None) or "").strip(),
    ]
    return ", ".join(p for p in parts if p)


def scheduled_shift_hours(assignment) -> Optional[float]:
    start = _assignment_shift_start_dt(assignment)
    end = _assignment_shift_end_dt(assignment)
    if not start or not end:
        return None
    brk = max(0, int(getattr(assignment, "break_minutes", 0) or 0))
    mins = (end - start).total_seconds() / 60.0 - brk
    return round(max(0.0, mins / 60.0), 2)


def _combine_hhmm(day, hhmm, *, after: Optional[datetime] = None):
    if not hhmm or not day:
        return None
    try:
        parts = str(hhmm).split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        dt = datetime.combine(day, time(h, m))
        if after is not None and dt <= after:
            dt = dt + timedelta(days=1)
        return dt
    except (ValueError, IndexError, TypeError):
        return None


def compute_worked_hours(
    *,
    shift_date,
    shift_start=None,
    shift_end=None,
    break_minutes=0,
    booked_at=None,
    booked_off_at=None,
    overtime_end=None,
    early_finish_end=None,
    cap_early_start: bool = False,
):
    """Actual (or payable) hours from clock-in to clock-out / scheduled end.

    Scheduled assignment times are never rewritten. Late arrival shortens the
    span from the real clock-in; overtime / early finish change only the end.
    """
    if booked_at is None:
        return None
    start = booked_at.replace(tzinfo=None) if getattr(booked_at, "tzinfo", None) else booked_at
    sched_start = _combine_hhmm(shift_date, shift_start)
    if cap_early_start and sched_start is not None and start < sched_start:
        start = sched_start
    if booked_off_at is not None:
        end = booked_off_at.replace(tzinfo=None) if getattr(booked_off_at, "tzinfo", None) else booked_off_at
    else:
        extra = overtime_end or early_finish_end
        if extra:
            end = _combine_hhmm(shift_date, extra, after=start)
        else:
            end = _combine_hhmm(shift_date, shift_end, after=start)
    if end is None:
        return None
    if end <= start:
        end = end + timedelta(days=1)
    brk = max(0, int(break_minutes or 0))
    mins = (end - start).total_seconds() / 60.0 - brk
    return round(max(0.0, mins / 60.0), 2)


def _append_note(existing: Optional[str], addition: str) -> Optional[str]:
    addition = (addition or "").strip()
    base = (existing or "").strip()
    if not addition:
        return base or None
    if not base:
        return addition
    if addition in base:
        return base
    return f"{base} | {addition}"


def _validated_cancel_hours(status: str, raw, *, label: str) -> Optional[float]:
    if status != CANCELLED_PAID:
        return None
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raise HTTPException(
            status_code=400, detail=f"{label} are required for a paid cancellation"
        )
    try:
        hours = float(raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{label} must be a number")
    if hours < 0 or hours > 24:
        raise HTTPException(status_code=400, detail=f"{label} must be between 0 and 24")
    return round(hours, 2)


def validated_paid_hours(status: str, raw) -> Optional[float]:
    return _validated_cancel_hours(status, raw, label="Agreed paid hours")


def validated_client_hours(status: str, raw) -> Optional[float]:
    return _validated_cancel_hours(status, raw, label="Agreed client hours")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_utc_naive(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _normalize_status(status: str) -> str:
    s = str(status or "").strip().lower().replace(" ", "_")
    s = STATUS_ALIASES.get(s, s)
    if s not in ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail="Invalid attendance status")
    return s


def _att_out(att: Attendance) -> Attendance:
    if att.updated_by is not None:
        setattr(att, "updated_by_name", att.updated_by.full_name)
    else:
        setattr(att, "updated_by_name", None)
    return att


def _enrich_attendance_rows(db: Session, rows: List[Attendance]) -> List[AttendanceResponse]:
    if not rows:
        return []
    assignment_ids = {a.assignment_id for a in rows if a.assignment_id}
    assignments = {
        a.id: a
        for a in db.query(Assignment)
        .options(joinedload(Assignment.site), joinedload(Assignment.guard))
        .filter(Assignment.id.in_(assignment_ids))
        .all()
    } if assignment_ids else {}

    ot_by_a: dict[int, ShiftOvertimeLog] = {}
    ef_by_a: dict[int, ShiftEarlyFinishLog] = {}
    late_by_a: dict[int, ShiftLateLog] = {}
    if assignment_ids:
        for row in (
            db.query(ShiftOvertimeLog)
            .filter(ShiftOvertimeLog.assignment_id.in_(assignment_ids))
            .order_by(ShiftOvertimeLog.id.desc())
            .all()
        ):
            if row.assignment_id and row.assignment_id not in ot_by_a:
                ot_by_a[row.assignment_id] = row
        for row in (
            db.query(ShiftEarlyFinishLog)
            .filter(ShiftEarlyFinishLog.assignment_id.in_(assignment_ids))
            .order_by(ShiftEarlyFinishLog.id.desc())
            .all()
        ):
            if row.assignment_id and row.assignment_id not in ef_by_a:
                ef_by_a[row.assignment_id] = row
        for row in (
            db.query(ShiftLateLog)
            .filter(ShiftLateLog.assignment_id.in_(assignment_ids))
            .order_by(ShiftLateLog.id.desc())
            .all()
        ):
            if row.assignment_id and row.assignment_id not in late_by_a:
                late_by_a[row.assignment_id] = row

    out: List[AttendanceResponse] = []
    for att in rows:
        _att_out(att)
        a = assignments.get(att.assignment_id)
        ot = ot_by_a.get(att.assignment_id)
        ef = ef_by_a.get(att.assignment_id)
        late = late_by_a.get(att.assignment_id)
        out.append(
            AttendanceResponse(
                id=att.id,
                assignment_id=att.assignment_id,
                guard_id=att.guard_id,
                booked_at=att.booked_at,
                booked_off_at=att.booked_off_at,
                status=att.status,
                note=att.note,
                paid_hours=att.paid_hours,
                client_hours=att.client_hours,
                created_at=att.created_at,
                updated_at=att.updated_at,
                updated_by_user_id=att.updated_by_user_id,
                updated_by_name=getattr(att, "updated_by_name", None),
                guard_name=(a.guard.full_name if a and a.guard else None),
                site_id=a.site_id if a else None,
                site_name=(a.site.name if a and a.site else None),
                shift_date=a.date if a else None,
                shift_start=a.shift_start if a else None,
                shift_end=a.shift_end if a else None,
                has_overtime=bool(ot),
                has_early_finish=bool(ef),
                overtime_end=ot.new_end if ot else None,
                early_finish_end=ef.actual_end if ef else None,
                late_minutes=late.late_minutes if late else None,
                scheduled_hours=scheduled_shift_hours(a) if a else None,
                actual_hours=compute_worked_hours(
                    shift_date=a.date if a else None,
                    shift_start=a.shift_start if a else None,
                    shift_end=a.shift_end if a else None,
                    break_minutes=(a.break_minutes or 0) if a else 0,
                    booked_at=att.booked_at,
                    booked_off_at=att.booked_off_at,
                    overtime_end=ot.new_end if ot else None,
                    early_finish_end=ef.actual_end if ef else None,
                )
                if a
                else None,
                location_name=getattr(att, "location_name", None),
                latitude=getattr(att, "latitude", None),
                longitude=getattr(att, "longitude", None),
            )
        )
    return out


def _get_owned_attendance(db: Session, attendance_id: int, user_id: int) -> Attendance:
    company = get_company_by_user_id(db, user_id)
    att = (
        db.query(Attendance)
        .options(joinedload(Attendance.updated_by))
        .join(Assignment)
        .join(Guard)
        .filter(Attendance.id == attendance_id, Guard.company_id == company.id)
        .first()
    )
    if not att:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    return att


def _scope_for_portal_user(db: Session, user_id: int, q):
    from app.services.portal_access import filter_assignments_for_user, is_portal_role

    user = db.query(User).filter(User.id == user_id).first()
    if user and is_portal_role(user):
        return filter_assignments_for_user(db, user, q)
    return q


def get_all_attendance(
    db: Session,
    user_id: int,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: Optional[int] = None,
) -> List[AttendanceResponse]:
    company = get_company_by_user_id(db, user_id)
    q = (
        db.query(Attendance)
        .options(joinedload(Attendance.updated_by))
        .join(Assignment)
        .join(Guard)
        .join(Site, Assignment.site_id == Site.id)
        .filter(Guard.company_id == company.id)
    )
    q = _scope_for_portal_user(db, user_id, q)
    if guard_id:
        q = q.filter(Attendance.guard_id == guard_id)
    if site_id:
        q = q.filter(Assignment.site_id == site_id)
    if start_date:
        q = q.filter(Assignment.date >= start_date)
    if end_date:
        q = q.filter(Assignment.date <= end_date)
    q = q.order_by(Attendance.updated_at.desc(), Attendance.created_at.desc())
    # Optional cap for mobile pulls; omitted keeps the previous unbounded behaviour.
    if limit is not None:
        lim = max(1, min(int(limit), 1000))
        q = q.limit(lim)
    rows = q.all()
    return _enrich_attendance_rows(db, rows)


def create_attendance(db: Session, data: AttendanceCreate, user_id: int) -> Attendance:
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    from app.services.portal_access import assert_not_portal_role, visible_assignment_or_404

    if user:
        assert_not_portal_role(user)
    a = visible_assignment_or_404(db, user, data.assignment_id, company.id) if user else None
    if not a:
        a = db.query(Assignment).join(Guard).filter(
            Assignment.id == data.assignment_id,
            Guard.company_id == company.id
        ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    guard = db.query(Guard).filter(Guard.id == data.guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    if payload.get("status"):
        payload["status"] = _normalize_status(payload["status"])
    status = payload.get("status") or ""
    payload["paid_hours"] = validated_paid_hours(status, payload.get("paid_hours"))
    payload["client_hours"] = validated_client_hours(status, payload.get("client_hours"))
    note = (payload.get("note") or "").strip()
    if payload.get("status") and payload["status"] != "on_time" and not note:
        # require note for non-default statuses when creating with status
        pass
    att = Attendance(**payload, updated_by_user_id=user_id)
    db.add(att)
    db.commit()
    db.refresh(att)
    att = (
        db.query(Attendance)
        .options(joinedload(Attendance.updated_by))
        .filter(Attendance.id == att.id)
        .first()
    )
    return _att_out(att)


def get_attendance_for_assignment(db: Session, assignment_id: int, user_id: int) -> List[Attendance]:
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    from app.services.portal_access import visible_assignment_or_404

    if user:
        visible_assignment_or_404(db, user, assignment_id, company.id)
    else:
        a = db.query(Assignment).join(Guard).filter(
            Assignment.id == assignment_id,
            Guard.company_id == company.id
        ).first()
        if not a:
            raise HTTPException(status_code=404, detail="Assignment not found")
    rows = (
        db.query(Attendance)
        .options(joinedload(Attendance.updated_by))
        .filter(Attendance.assignment_id == assignment_id)
        .all()
    )
    return [_att_out(r) for r in rows]


def book_on_off(db: Session, data: BookingOnOff, user_id: int) -> Attendance:
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    from app.services.portal_access import (
        assert_not_client_portal,
        is_staff_portal_user,
        visible_assignment_or_404,
    )
    from app.services.patrol_schedule_service import site_geofence_ok

    if user:
        assert_not_client_portal(user)
        a = visible_assignment_or_404(db, user, data.assignment_id, company.id)
    else:
        a = db.query(Assignment).join(Guard).filter(
            Assignment.id == data.assignment_id,
            Guard.company_id == company.id
        ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")

    staff_portal = bool(user and is_staff_portal_user(user))
    site = db.query(Site).filter(Site.id == a.site_id).first() if a.site_id else None
    now_utc = datetime.now(timezone.utc)
    now = _naive_company_now(company)
    shift_dt = _assignment_shift_start_dt(a)

    if not data.book_off and staff_portal and shift_dt is not None:
        earliest = shift_dt - timedelta(minutes=EARLY_BOOK_ON_MINUTES)
        if now < earliest.replace(tzinfo=None):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "too_early",
                    "message": (
                        f"Clock In opens {EARLY_BOOK_ON_MINUTES} minutes before "
                        f"the {a.shift_start} start."
                    ),
                    "earliest_at": earliest.isoformat(),
                    "shift_start": shift_dt.isoformat(),
                },
            )

    lat = data.latitude
    lng = data.longitude
    accuracy = data.accuracy_m if data.accuracy_m is not None else data.accuracy
    site_has_coords = bool(
        site and site.latitude is not None and site.longitude is not None
    )
    if staff_portal and site_has_coords and (lat is None or lng is None):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "gps_required",
                "message": "GPS location is required to Clock In/Out at this site.",
            },
        )
    if lat is not None and lng is not None:
        ok, dist = site_geofence_ok(site, float(lat), float(lng), default_radius_m=150.0)
        if not ok:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "outside_geofence",
                    "message": f"You are outside the site boundary ({dist}m away).",
                    "distance_m": dist,
                },
            )

    reason = (getattr(data, "note", None) or "").strip()
    shift_end_dt = _assignment_shift_end_dt(a)
    is_late_arrival = (
        not data.book_off
        and shift_dt is not None
        and is_late_clock_in(now, shift_dt)
    )
    is_early_finish = (
        data.book_off
        and shift_end_dt is not None
        and now < (shift_end_dt - timedelta(minutes=5)).replace(tzinfo=None)
    )
    is_late_finish = (
        data.book_off
        and shift_end_dt is not None
        and now > shift_end_dt.replace(tzinfo=None)
    )
    logger.info(
        "clock %s assignment=%s user=%s local_now=%s start=%s late=%s early_finish=%s late_finish=%s",
        "out" if data.book_off else "in",
        data.assignment_id,
        user_id,
        now.isoformat(timespec="seconds"),
        shift_dt.isoformat(timespec="minutes") if shift_dt else None,
        is_late_arrival,
        is_early_finish,
        is_late_finish,
    )
    if staff_portal and (is_late_arrival or is_early_finish or is_late_finish) and not reason:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "reason_required",
                "message": (
                    "A reason is required for late arrival."
                    if is_late_arrival
                    else "A reason is required for finishing early."
                    if is_early_finish
                    else "A reason is required for overtime / late finish."
                ),
            },
        )

    att = (
        db.query(Attendance)
        .filter(Attendance.assignment_id == data.assignment_id, Attendance.guard_id == a.guard_id)
        .order_by(Attendance.id.asc())
        .first()
    )
    if not att:
        try:
            with db.begin_nested():
                att = Attendance(assignment_id=data.assignment_id, guard_id=a.guard_id, status="on_time")
                db.add(att)
                db.flush()
        except IntegrityError:
            att = (
                db.query(Attendance)
                .filter(Attendance.assignment_id == data.assignment_id, Attendance.guard_id == a.guard_id)
                .order_by(Attendance.id.asc())
                .first()
            )
            if att is None:
                raise
    from app.middleware.client_source import get_client_source

    mobile_client = get_client_source() == "mobile"
    if data.book_off:
        if att.booked_off_at:
            if mobile_client:
                return _att_out(att)
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "already_clocked_out",
                    "message": "This shift is already clocked out.",
                },
            )
        if not att.booked_at and staff_portal:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "not_clocked_in",
                    "message": "Clock In before Clock Out.",
                },
            )
        att.booked_off_at = now_utc
        if is_early_finish:
            att.status = "early_leave"
            existing_ef = (
                db.query(ShiftEarlyFinishLog)
                .filter(ShiftEarlyFinishLog.assignment_id == a.id)
                .first()
            )
            actual_end = _hhmm(now)
            if existing_ef:
                existing_ef.actual_end = actual_end
                existing_ef.reason = reason
                existing_ef.recorded_by = user_id
            else:
                db.add(
                    ShiftEarlyFinishLog(
                        company_id=company.id,
                        assignment_id=a.id,
                        guard_id=a.guard_id,
                        site_id=a.site_id,
                        shift_date=a.date,
                        shift_start=a.shift_start,
                        scheduled_end=a.shift_end,
                        actual_end=actual_end,
                        reason=reason,
                        recorded_by=user_id,
                    )
                )
        elif is_late_finish:
            existing_ot = (
                db.query(ShiftOvertimeLog)
                .filter(ShiftOvertimeLog.assignment_id == a.id)
                .first()
            )
            new_end = _hhmm(now)
            if existing_ot:
                existing_ot.new_end = new_end
                existing_ot.reason = reason
                existing_ot.recorded_by = user_id
            else:
                db.add(
                    ShiftOvertimeLog(
                        company_id=company.id,
                        assignment_id=a.id,
                        guard_id=a.guard_id,
                        site_id=a.site_id,
                        shift_date=a.date,
                        shift_start=a.shift_start,
                        scheduled_end=a.shift_end,
                        new_end=new_end,
                        reason=reason,
                        recorded_by=user_id,
                    )
                )
    else:
        if att.booked_at:
            if mobile_client:
                return _att_out(att)
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "already_clocked_in",
                    "message": "This shift is already clocked in.",
                },
            )
        att.booked_at = now_utc
        if is_late_arrival:
            att.status = "late"
            late_mins = max(
                1,
                int((now - shift_dt.replace(tzinfo=None)).total_seconds() // 60),
            )
            existing_late = (
                db.query(ShiftLateLog)
                .filter(ShiftLateLog.assignment_id == a.id)
                .first()
            )
            actual_start = _hhmm(now)
            if existing_late:
                existing_late.actual_start = actual_start
                existing_late.late_minutes = late_mins
                existing_late.note = reason or existing_late.note
                existing_late.recorded_by = user_id
            else:
                db.add(
                    ShiftLateLog(
                        company_id=company.id,
                        assignment_id=a.id,
                        guard_id=a.guard_id,
                        site_id=a.site_id,
                        shift_date=a.date,
                        scheduled_start=a.shift_start or _hhmm(shift_dt),
                        actual_start=actual_start,
                        late_minutes=late_mins,
                        note=reason or None,
                        recorded_by=user_id,
                    )
                )
        else:
            # Preserve a status already set by an authorised web user when it is
            # already a booked-on status; otherwise mark on time.
            if (att.status or "").strip().lower() not in {"on_time", "late", "present", "booked_on"}:
                att.status = "on_time"

    if reason:
        att.note = _append_note(att.note, reason)

    if lat is not None and lng is not None:
        captured = data.captured_at.isoformat() if data.captured_at else now_utc.isoformat()
        acc_part = f" ±{float(accuracy):.1f}m" if accuracy is not None else ""
        loc_name = (getattr(data, "location_name", None) or "").strip()
        if not loc_name:
            loc_name = _site_location_label(site)
        if not data.book_off:
            att.latitude = float(lat)
            att.longitude = float(lng)
            if loc_name:
                att.location_name = loc_name[:255]
        gps_label = f"{loc_name} ({float(lat):.6f},{float(lng):.6f})" if loc_name else f"{float(lat):.6f},{float(lng):.6f}"
        gps_note = f"GPS {gps_label}{acc_part} @ {captured}"
        if data.device_id:
            gps_note = f"{gps_note} device={data.device_id}"
        att.note = _append_note(att.note, gps_note)

    att.updated_by_user_id = user_id
    db.commit()
    db.refresh(att)
    att = (
        db.query(Attendance)
        .options(joinedload(Attendance.updated_by))
        .filter(Attendance.id == att.id)
        .first()
    )
    return _att_out(att)


def get_late_summary(db: Session, user_id: int, start: Optional[date] = None, end: Optional[date] = None) -> List[Attendance]:
    company = get_company_by_user_id(db, user_id)
    q = (
        db.query(Attendance)
        .options(joinedload(Attendance.updated_by))
        .join(Assignment)
        .join(Guard)
        .join(Site, Assignment.site_id == Site.id)
        .filter(
            Guard.company_id == company.id,
            Attendance.status == "late",
        )
    )
    q = _scope_for_portal_user(db, user_id, q)
    if start:
        q = q.filter(Assignment.date >= start)
    if end:
        q = q.filter(Assignment.date <= end)
    return [_att_out(a) for a in q.all()]


def update_attendance(db: Session, attendance_id: int, data: AttendanceUpdate, user_id: int) -> Attendance:
    user = db.query(User).filter(User.id == user_id).first()
    from app.services.portal_access import assert_not_portal_role

    if user:
        assert_not_portal_role(user)
    att = _get_owned_attendance(db, attendance_id, user_id)
    payload = data.model_dump(exclude_unset=True) if hasattr(data, "model_dump") else data.dict(exclude_unset=True)
    if "status" in payload and payload["status"] is not None:
        payload["status"] = _normalize_status(payload["status"])
    if "note" in payload and payload["note"] is not None:
        payload["note"] = str(payload["note"]).strip() or None
    if "status" in payload:
        note = payload.get("note", att.note)
        status = payload.get("status", att.status)
        if status != "on_time" and not (note or "").strip():
            raise HTTPException(status_code=400, detail=NOTE_REQUIRED_DETAIL)
        # Re-derive the agreed hours from the status being saved, so switching a shift
        # off "cancelled_paid" clears the figures even when the caller left them out.
        payload["paid_hours"] = validated_paid_hours(
            status, payload.get("paid_hours", att.paid_hours)
        )
        payload["client_hours"] = validated_client_hours(
            status, payload.get("client_hours", att.client_hours)
        )
    now = _utc_now()
    if "booked_at" in payload and payload["booked_at"] is not None:
        if _as_utc_naive(payload["booked_at"]) > now:
            raise HTTPException(status_code=400, detail="Booked on cannot be in the future")
    if "booked_off_at" in payload and payload["booked_off_at"] is not None:
        if _as_utc_naive(payload["booked_off_at"]) > now:
            raise HTTPException(status_code=400, detail="Booked off cannot be in the future")
    for k, v in payload.items():
        setattr(att, k, v)
    att.updated_by_user_id = user_id
    db.commit()
    db.refresh(att)
    att = (
        db.query(Attendance)
        .options(joinedload(Attendance.updated_by))
        .filter(Attendance.id == att.id)
        .first()
    )
    return _att_out(att)


def upsert_attendance_by_shift(db: Session, user_id: int, data: AttendanceByShiftRequest) -> Attendance:
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    from app.services.portal_access import assert_not_client_portal, visible_assignment_or_404

    if user:
        assert_not_client_portal(user)
    status = _normalize_status(data.status)
    note = (data.note or "").strip()
    if status != "on_time" and not note:
        raise HTTPException(status_code=400, detail=NOTE_REQUIRED_DETAIL)
    paid_hours = validated_paid_hours(status, data.paid_hours)
    client_hours = validated_client_hours(status, data.client_hours)
    a = find_assignment(db, company.id, data.guard_id, data.date, data.shift_start, data.site_name or "")
    if not a:
        a = _ensure_assignment_from_published_rota(
            db, user_id, company.id, data.guard_id, data.date, data.shift_start, data.site_name or ""
        )
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found for this shift (publish the rota first)")
    if user:
        visible_assignment_or_404(db, user, a.id, company.id)
    att = (
        db.query(Attendance)
        .filter(Attendance.assignment_id == a.id, Attendance.guard_id == a.guard_id)
        .first()
    )
    if not att:
        att = Attendance(assignment_id=a.id, guard_id=a.guard_id)
        db.add(att)
        db.flush()
    att.status = status
    att.note = note or None
    att.paid_hours = paid_hours
    att.client_hours = client_hours
    att.updated_by_user_id = user_id
    if status in ("absent", "no_show") or status in CANCELLED_STATUSES:
        pass
    elif status == "late" and not att.booked_at:
        att.booked_at = datetime.utcnow()
    elif status == "on_time" and not att.booked_at:
        att.booked_at = datetime.utcnow()
    db.commit()
    db.refresh(att)
    att = (
        db.query(Attendance)
        .options(joinedload(Attendance.updated_by))
        .filter(Attendance.id == att.id)
        .first()
    )
    return _att_out(att)


def _ensure_assignment_from_published_rota(
    db: Session,
    user_id: int,
    company_id: int,
    guard_id: int,
    shift_date: date,
    shift_start: str,
    site_name: str,
):
    from app.models import RotaPlan
    from app.services import rota_plan_service

    # Prefer plans that already have assignments for this guard (actively published).
    plan_ids = [
        int(r[0])
        for r in (
            db.query(Assignment.rota_plan_id)
            .filter(
                Assignment.guard_id == guard_id,
                Assignment.rota_plan_id.isnot(None),
            )
            .distinct()
            .all()
        )
        if r[0] is not None
    ]
    # Also consider published plans covering this date (in case assignments were wiped).
    covering = (
        db.query(RotaPlan)
        .filter(
            RotaPlan.company_id == company_id,
            RotaPlan.status == "published",
            RotaPlan.start_date <= shift_date,
            RotaPlan.end_date >= shift_date,
        )
        .all()
    )
    for p in covering:
        if p.id not in plan_ids:
            plan_ids.append(p.id)

    for plan_id in plan_ids:
        try:
            rota_plan_service.publish_rota_plan(db, user_id, plan_id, guard_id=guard_id)
        except HTTPException:
            continue
        a = find_assignment(db, company_id, guard_id, shift_date, shift_start, site_name)
        if a:
            return a
    return None


def sync_published_plan_attendance(db: Session, user_id: int, plan) -> None:
    if plan.status != "published" or not plan.planner_data:
        return
    try:
        payload = json.loads(plan.planner_data)
    except (json.JSONDecodeError, TypeError):
        return
    company = get_company_by_user_id(db, user_id)
    shifts = payload.get("shifts") or {}
    changed = False
    for key, record in (payload.get("attendance") or {}).items():
        if not isinstance(record, dict):
            continue
        parts = str(key).split(":", 2)
        if len(parts) != 3:
            continue
        guard_raw, day_raw, index_raw = parts
        try:
            guard_id = int(guard_raw)
            shift_date = date.fromisoformat(day_raw)
            shift_index = int(index_raw)
            shift = shifts[guard_raw][day_raw][shift_index]
        except (TypeError, ValueError, KeyError, IndexError):
            continue
        if not isinstance(shift, dict):
            continue
        status_raw = str(record.get("status") or "").strip()
        if not status_raw:
            continue
        try:
            status = _normalize_status(status_raw)
        except HTTPException:
            continue
        # A missing note is not a reason to drop the status. The note is required at the
        # point of entry; dropping it here instead left the shift reading as unmarked
        # everywhere and prompting to be marked all over again.
        note = (record.get("note") or "").strip()
        scheduled_start = shift.get("scheduledStart") or shift.get("start") or ""
        assignment = find_assignment(
            db,
            company.id,
            guard_id,
            shift_date,
            scheduled_start,
            shift.get("site") or "",
        )
        if not assignment:
            continue
        attendance = (
            db.query(Attendance)
            .filter(
                Attendance.assignment_id == assignment.id,
                Attendance.guard_id == guard_id,
            )
            .first()
        )
        if not attendance:
            attendance = Attendance(assignment_id=assignment.id, guard_id=guard_id)
            db.add(attendance)
        attendance.status = status
        attendance.note = note or None
        attendance.updated_by_user_id = user_id
        if status in {"on_time", "late"} and not attendance.booked_at:
            attendance.booked_at = datetime.utcnow()
        changed = True
    if changed:
        db.commit()


def delete_attendance(db: Session, attendance_id: int, user_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    from app.services.portal_access import assert_not_portal_role

    if user:
        assert_not_portal_role(user)
    att = _get_owned_attendance(db, attendance_id, user_id)
    db.delete(att)
    db.commit()
