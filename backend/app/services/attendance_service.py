import json
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
from typing import List, Optional
from datetime import datetime, date, timezone
from app.models import Attendance, Assignment, Guard, Site, User
from app.schemas import AttendanceCreate, BookingOnOff, AttendanceUpdate, AttendanceByShiftRequest
from app.services.company_service import get_company_by_user_id
from app.services.shift_adjustment_service import find_assignment

ALLOWED_STATUS = {"on_time", "late", "absent", "early_leave", "no_show", "present"}
STATUS_ALIASES = {"present": "on_time"}


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
    # attach display name for response serialization via attribute
    if att.updated_by is not None:
        setattr(att, "updated_by_name", att.updated_by.full_name)
    else:
        setattr(att, "updated_by_name", None)
    return att


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
    """Attendance rows inherit the scope of the shift they belong to.

    Attendance is joined through Assignment, so the same narrowing that limits a portal
    login's rota limits which clock-ins it can read.
    """
    from app.services.portal_access import filter_assignments_for_user, is_portal_role

    user = db.query(User).filter(User.id == user_id).first()
    if user and is_portal_role(user):
        return filter_assignments_for_user(db, user, q)
    return q


def get_all_attendance(db: Session, user_id: int, guard_id: Optional[int] = None) -> List[Attendance]:
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
    rows = q.order_by(Attendance.updated_at.desc(), Attendance.created_at.desc()).all()
    return [_att_out(a) for a in rows]


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
            raise HTTPException(status_code=400, detail="Note is required for Late, Absent, and No show")
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
        raise HTTPException(status_code=400, detail="Note is required for Late, Absent, and No show")
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
    att.updated_by_user_id = user_id
    if status in ("absent", "no_show"):
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
        note = (record.get("note") or "").strip()
        if status != "on_time" and not note:
            continue
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
