from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.models import User
from app.schemas import AttendanceCreate, AttendanceResponse, BookingOnOff
from app.auth import get_current_user
from app.services import attendance_service

router = APIRouter(prefix="/attendance", tags=["attendance"])

@router.post("", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
def create_attendance(data: AttendanceCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return attendance_service.create_attendance(db, data, current_user.id)

@router.post("/book", response_model=AttendanceResponse)
def book_on_off(data: BookingOnOff, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return attendance_service.book_on_off(db, data, current_user.id)

@router.get("/assignment/{assignment_id}", response_model=List[AttendanceResponse])
def list_attendance(assignment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return attendance_service.get_attendance_for_assignment(db, assignment_id, current_user.id)

@router.get("/late", response_model=List[AttendanceResponse])
def late_summary(start_date: Optional[date] = None, end_date: Optional[date] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return attendance_service.get_late_summary(db, current_user.id, start_date, end_date)
