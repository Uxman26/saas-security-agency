from fastapi import APIRouter, Depends, Path, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.models import User
from app.schemas import (
    AttendanceCreate,
    AttendanceUpdate,
    AttendanceResponse,
    BookingOnOff,
    AttendanceByShiftRequest,
    AttendanceClearByShiftRequest,
    MissedAttendanceSummary,
)
from app.rbac import require_internal_module, require_module
from app.services import attendance_service, missed_attendance_service

router = APIRouter(prefix="/attendance", tags=["attendance"])

@router.get("", response_model=List[AttendanceResponse])
def list_attendance_all(
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("attendance", "view")),
):
    return attendance_service.get_all_attendance(
        db,
        current_user.id,
        guard_id,
        site_id=site_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )

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

@router.post("/by-shift/clear", status_code=status.HTTP_204_NO_CONTENT)
def clear_by_shift(
    data: AttendanceClearByShiftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("attendance", "book_by_shift")),
):
    attendance_service.clear_attendance_by_shift(db, current_user.id, data)
    return None

@router.get("/assignment/{assignment_id}", response_model=List[AttendanceResponse])
def list_attendance(assignment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("attendance", "view"))):
    return attendance_service.get_attendance_for_assignment(db, assignment_id, current_user.id)

@router.get("/late", response_model=List[AttendanceResponse])
def late_summary(start_date: Optional[date] = None, end_date: Optional[date] = None, db: Session = Depends(get_db), current_user: User = Depends(require_module("attendance", "late_view"))):
    return attendance_service.get_late_summary(db, current_user.id, start_date, end_date)

@router.get("/missed-clocks", response_model=MissedAttendanceSummary)
@router.get("/missed", response_model=MissedAttendanceSummary, include_in_schema=False)
def missed_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: Optional[int] = 500,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("attendance", "view")),
):
    """Missed Clock-Ins / Clock-Outs for active (published) rota assignments.

    Prefer ``/attendance/missed-clocks`` — ``/missed`` is kept as an alias but can
    405 on older stacks when it collides with ``/{attendance_id}``.
    """
    return missed_attendance_service.list_missed_attendance(
        db,
        current_user.id,
        start_date=start_date,
        end_date=end_date,
        limit=max(1, min(int(limit or 500), 1000)),
    )

@router.put("/{attendance_id}", response_model=AttendanceResponse)
def update_attendance(
    data: AttendanceUpdate,
    attendance_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("attendance", "edit")),
):
    return attendance_service.update_attendance(db, attendance_id, data, current_user.id)

@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance(
    attendance_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("attendance", "delete")),
):
    attendance_service.delete_attendance(db, attendance_id, current_user.id)
    return None
