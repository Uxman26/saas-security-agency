from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
from typing import List, Optional
from datetime import datetime, date
from app.models import Attendance, Assignment, Guard, User
from app.schemas import AttendanceCreate, BookingOnOff, AttendanceUpdate, AttendanceByShiftRequest
from app.services.company_service import get_company_by_user_id
from app.services.shift_adjustment_service import find_assignment

ALLOWED_STATUS = {"on_time", "late", "absent", "early_leave", "no_show", "present"}
STATUS_ALIASES = {"present": "on_time"}


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


def get_all_attendance(db: Session, user_id: int, guard_id: Optional[int] = None) -> List[Attendance]:
    company = get_company_by_user_id(db, user_id)
    q = (
        db.query(Attendance)
        .options(joinedload(Attendance.updated_by))
        .join(Assignment)
        .join(Guard)
        .filter(Guard.company_id == company.id)
    )
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
        .filter(
            Guard.company_id == company.id,
            Attendance.status == "late",
        )
    )
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
        if not (note or "").strip():
            raise HTTPException(status_code=400, detail="Note is required when updating attendance status")
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
    note = (data.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="Note is required")
    status = _normalize_status(data.status)
    a = find_assignment(db, company.id, data.guard_id, data.date, data.shift_start, data.site_name or "")
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
    att.note = note
    att.updated_by_user_id = user_id
    if status in ("absent", "no_show"):
        # keep booked times empty for no-shows/absent
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


def delete_attendance(db: Session, attendance_id: int, user_id: int) -> None:
    att = _get_owned_attendance(db, attendance_id, user_id)
    db.delete(att)
    db.commit()
