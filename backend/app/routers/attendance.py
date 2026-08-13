from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.models import User
from app.schemas import AttendanceCreate, AttendanceUpdate, AttendanceResponse, BookingOnOff, AttendanceByShiftRequest
from app.rbac import require_module
from app.services import attendance_service

router = APIRouter(prefix="/attendance", tags=["attendance"])

@router.get("", response_model=List[AttendanceResponse])
def list_attendance_all(
    guard_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("attendance", "view")),
):
    return attendance_service.get_all_attendance(db, current_user.id, guard_id)

@router.post("", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
def create_attendance(data: AttendanceCreate, db: Session = Depends(get_db), current_user: User = Depends(require_module("attendance", "create"))):
    return attendance_service.create_attendance(db, data, current_user.id)

@router.post("/book", response_model=AttendanceResponse)
def book_on_off(data: BookingOnOff, db: Session = Depends(get_db), current_user: User = Depends(require_module("attendance", "book"))):
    return attendance_service.book_on_off(db, data, current_user.id)

@router.post("/by-shift", response_model=AttendanceResponse)
def upsert_by_shift(
    data: AttendanceByShiftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("attendance", "book_by_shift")),
):
    return attendance_service.upsert_attendance_by_shift(db, current_user.id, data)

@router.get("/assignment/{assignment_id}", response_model=List[AttendanceResponse])
def list_attendance(assignment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("attendance", "view"))):
    return attendance_service.get_attendance_for_assignment(db, assignment_id, current_user.id)

@router.get("/late", response_model=List[AttendanceResponse])
def late_summary(start_date: Optional[date] = None, end_date: Optional[date] = None, db: Session = Depends(get_db), current_user: User = Depends(require_module("attendance", "late_view"))):
    return attendance_service.get_late_summary(db, current_user.id, start_date, end_date)

@router.put("/{attendance_id}", response_model=AttendanceResponse)
def update_attendance(attendance_id: int, data: AttendanceUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_module("attendance", "edit"))):
    return attendance_service.update_attendance(db, attendance_id, data, current_user.id)

@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance(attendance_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("attendance", "delete"))):
    attendance_service.delete_attendance(db, attendance_id, current_user.id)
    return None
