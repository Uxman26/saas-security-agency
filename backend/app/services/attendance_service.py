from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import datetime, date
from app.models import Attendance, Assignment, Guard
from app.schemas import AttendanceCreate, BookingOnOff, AttendanceUpdate
from app.services.company_service import get_company_by_user_id

def _get_owned_attendance(db: Session, attendance_id: int, user_id: int) -> Attendance:
    company = get_company_by_user_id(db, user_id)
    att = (
        db.query(Attendance)
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
    q = db.query(Attendance).join(Assignment).join(Guard).filter(Guard.company_id == company.id)
    if guard_id:
        q = q.filter(Attendance.guard_id == guard_id)
    return q.order_by(Attendance.created_at.desc()).all()

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
    att = Attendance(**payload)
    db.add(att)
    db.commit()
    db.refresh(att)
    return att

def get_attendance_for_assignment(db: Session, assignment_id: int, user_id: int) -> List[Attendance]:
    company = get_company_by_user_id(db, user_id)
    a = db.query(Assignment).join(Guard).filter(
        Assignment.id == assignment_id,
        Guard.company_id == company.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return db.query(Attendance).filter(Attendance.assignment_id == assignment_id).all()

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
    db.commit()
    db.refresh(att)
    return att

def get_late_summary(db: Session, user_id: int, start: Optional[date] = None, end: Optional[date] = None) -> List[Attendance]:
    company = get_company_by_user_id(db, user_id)
    q = db.query(Attendance).join(Assignment).join(Guard).filter(
        Guard.company_id == company.id,
        Attendance.status == "late"
    )
    if start:
        q = q.filter(Assignment.date >= start)
    if end:
        q = q.filter(Assignment.date <= end)
    return q.all()

def update_attendance(db: Session, attendance_id: int, data: AttendanceUpdate, user_id: int) -> Attendance:
    att = _get_owned_attendance(db, attendance_id, user_id)
    payload = data.model_dump(exclude_unset=True) if hasattr(data, "model_dump") else data.dict(exclude_unset=True)
    allowed_status = {"on_time", "late", "absent", "early_leave", "no_show", "present"}
    if "status" in payload and payload["status"] is not None:
        status = str(payload["status"]).strip().lower().replace(" ", "_")
        if status not in allowed_status:
            raise HTTPException(status_code=400, detail="Invalid attendance status")
        payload["status"] = status
    for k, v in payload.items():
        setattr(att, k, v)
    db.commit()
    db.refresh(att)
    return att

def delete_attendance(db: Session, attendance_id: int, user_id: int) -> None:
    att = _get_owned_attendance(db, attendance_id, user_id)
    db.delete(att)
    db.commit()
