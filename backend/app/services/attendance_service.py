import json
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
from typing import List, Optional
from datetime import datetime, date, timezone
from app.models import Attendance, Assignment, Guard, Site, User, ShiftOvertimeLog, ShiftEarlyFinishLog, ShiftLateLog
from app.schemas import AttendanceCreate, BookingOnOff, AttendanceUpdate, AttendanceByShiftRequest, AttendanceResponse
from app.services.company_service import get_company_by_user_id
from app.services.shift_adjustment_service import find_assignment

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


def validated_paid_hours(status: str, raw) -> Optional[float]:
    """The agreed paid hours for a status, or None where the status does not carry any.

    Only a paid cancellation has an agreed figure, and on that status it is mandatory:
    the whole point of the status is that the hours were negotiated rather than worked,
    so there is nothing to fall back on if it is missing. Any other status drops whatever
    was sent, so a figure cannot linger after a shift is re-marked as worked.
    """
    if status != CANCELLED_PAID:
        return None
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raise HTTPException(
            status_code=400, detail="Agreed paid hours are required for a paid cancellation"
        )
    try:
        hours = float(raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Agreed paid hours must be a number")
    if hours < 0 or hours > 24:
        raise HTTPException(status_code=400, detail="Agreed paid hours must be between 0 and 24")
    return round(hours, 2)


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
    rows = q.order_by(Attendance.updated_at.desc(), Attendance.created_at.desc()).all()
    return _enrich_attendance_rows(db, rows)


def create_attendance(db: Session, data: AttendanceCreate, user_id: int) -> Attendance:
    company = get_company_by_user_id(db, user_id)
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
    payload["paid_hours"] = validated_paid_hours(payload.get("status") or "", payload.get("paid_hours"))
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
    a = db.query(Assignment).join(Guard).filter(
        Assignment.id == data.assignment_id,
        Guard.company_id == company.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    att = db.query(Attendance).filter(
        Attendance.assignment_id == data.assignment_id,
        Attendance.guard_id == a.guard_id
    ).first()
    now = datetime.utcnow()
    if not att:
        att = Attendance(assignment_id=data.assignment_id, guard_id=a.guard_id, status="on_time")
        db.add(att)
        db.flush()
    if data.book_off:
        att.booked_off_at = now
    else:
        att.booked_at = now
        shift_start = a.shift_start
        if shift_start:
            try:
                parts = shift_start.split(":")
                h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
                from datetime import time
                t = time(h, m)
                dt = datetime.combine(a.date, t)
                if now.replace(tzinfo=None) > dt.replace(tzinfo=None) if hasattr(dt, "replace") else now > dt:
                    att.status = "late"
            except (ValueError, IndexError):
                pass
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
        # off "cancelled_paid" clears the figure even when the caller left it out.
        payload["paid_hours"] = validated_paid_hours(
            status, payload.get("paid_hours", att.paid_hours)
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
    status = _normalize_status(data.status)
    note = (data.note or "").strip()
    if status != "on_time" and not note:
        raise HTTPException(status_code=400, detail=NOTE_REQUIRED_DETAIL)
    paid_hours = validated_paid_hours(status, data.paid_hours)
    a = find_assignment(db, company.id, data.guard_id, data.date, data.shift_start, data.site_name or "")
    if not a:
        # Published staff may have new/edited shifts that are not yet mirrored to assignments.
        # Re-publish that guard from any covering published rota, then retry the lookup.
        a = _ensure_assignment_from_published_rota(
            db, user_id, company.id, data.guard_id, data.date, data.shift_start, data.site_name or ""
        )
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found for this shift (publish the rota first)")
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
    att.updated_by_user_id = user_id
    if status in ("absent", "no_show") or status in CANCELLED_STATUSES:
        # Nobody turned up, so there is no book-on to record — including on a paid
        # cancellation, where the pay is agreed rather than worked.
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
    att = _get_owned_attendance(db, attendance_id, user_id)
    db.delete(att)
    db.commit()
