from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
from app.database import get_db
from app.models import User
from app.rbac import require_perm, PERM_ASSIGN_READ, PERM_ASSIGN_WRITE, PERM_ASSIGN_DELETE
from app.services import assignment_service
from app.services import rota_service
from app.services import rota_export
from app.services import shift_adjustment_service
from app.schemas import (
    AssignmentCreate,
    AssignmentResponse,
    RotaResponse,
    RotaDetailResponse,
    RotaSummaryRow,
    ShiftAdjustmentByShiftRequest,
    ShiftEarlyFinishLogResponse,
    ShiftEarlyFinishRequest,
    ShiftLateLogResponse,
    ShiftLatenessByShiftRequest,
    ShiftLatenessRequest,
    ShiftOvertimeLogResponse,
    ShiftOvertimeRequest,
)

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.post("", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(assignment: AssignmentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE))):
    return assignment_service.create_assignment(db, assignment, current_user.id)


@router.get("", response_model=list[AssignmentResponse])
def get_assignments(
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    client_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_READ)),
):
    return assignment_service.get_assignments(
        db, current_user.id, guard_id, site_id, client_id, start_date, end_date
    )


@router.get("/rota/detail", response_model=list[RotaDetailResponse])
def get_rota_detail(
    start_date: date,
    end_date: date,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_READ)),
):
    return rota_service.list_rota_details(db, current_user.id, start_date, end_date, guard_id, site_id, client_id)


@router.get("/rota/summary", response_model=list[RotaSummaryRow])
def get_rota_summary(
    start_date: date,
    end_date: date,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_READ)),
):
    return rota_service.rota_summary(db, current_user.id, start_date, end_date, guard_id, site_id, client_id)


@router.get("/rota/export")
def export_rota(
    start_date: date,
    end_date: date,
    format: str = "xlsx",
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_READ)),
):
    details = rota_service.list_rota_details(db, current_user.id, start_date, end_date, guard_id, site_id, client_id)
    summary = rota_service.rota_summary(db, current_user.id, start_date, end_date, guard_id, site_id, client_id)
    fmt = (format or "xlsx").lower()
    if fmt == "pdf":
        body = rota_export.export_rota_pdf(details, summary)
        return Response(
            content=body,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="rota.pdf"'},
        )
    body = rota_export.export_rota_xlsx(details, summary)
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="rota.xlsx"'},
    )


@router.get("/rota", response_model=list[RotaResponse])
def get_rota(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_READ)),
):
    return assignment_service.get_rota(db, current_user.id, start_date, end_date, guard_id, site_id, client_id)


@router.post("/by-shift/overtime", response_model=ShiftOvertimeLogResponse)
def record_shift_overtime(
    body: ShiftAdjustmentByShiftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE)),
):
    if not body.new_end:
        raise HTTPException(status_code=400, detail="new_end is required")
    return shift_adjustment_service.record_overtime_by_shift(
        db, current_user.id, body.guard_id, body.date, body.shift_start, body.site_name, body.new_end, body.reason
    )


@router.post("/by-shift/early-finish", response_model=ShiftEarlyFinishLogResponse)
def record_shift_early_finish(
    body: ShiftAdjustmentByShiftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE)),
):
    if not body.actual_end:
        raise HTTPException(status_code=400, detail="actual_end is required")
    return shift_adjustment_service.record_early_finish_by_shift(
        db, current_user.id, body.guard_id, body.date, body.shift_start, body.site_name, body.actual_end, body.reason
    )


@router.post("/by-shift/lateness", response_model=ShiftLateLogResponse)
def record_shift_lateness(
    body: ShiftLatenessByShiftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE)),
):
    return shift_adjustment_service.record_lateness_by_shift(
        db,
        current_user.id,
        body.guard_id,
        body.date,
        body.shift_start,
        body.site_name,
        body.late_minutes,
        body.note,
    )


@router.get("/{assignment_id}", response_model=AssignmentResponse)
def get_assignment(assignment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_ASSIGN_READ))):
    return assignment_service.get_assignment_by_id(db, assignment_id, current_user.id)


@router.put("/{assignment_id}", response_model=AssignmentResponse)
def update_assignment(assignment_id: int, assignment: AssignmentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE))):
    return assignment_service.update_assignment(db, assignment_id, assignment, current_user.id)


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(assignment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_ASSIGN_DELETE))):
    assignment_service.delete_assignment(db, assignment_id, current_user.id)
    return None


@router.post("/{assignment_id}/overtime", response_model=ShiftOvertimeLogResponse)
def record_assignment_overtime(
    assignment_id: int,
    body: ShiftOvertimeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE)),
):
    return shift_adjustment_service.record_overtime(db, current_user.id, assignment_id, body.new_end, body.reason)


@router.post("/{assignment_id}/early-finish", response_model=ShiftEarlyFinishLogResponse)
def record_assignment_early_finish(
    assignment_id: int,
    body: ShiftEarlyFinishRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE)),
):
    return shift_adjustment_service.record_early_finish(db, current_user.id, assignment_id, body.actual_end, body.reason)


@router.post("/{assignment_id}/lateness", response_model=ShiftLateLogResponse)
def record_assignment_lateness(
    assignment_id: int,
    body: ShiftLatenessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE)),
):
    return shift_adjustment_service.record_lateness_for_assignment(
        db, current_user.id, assignment_id, body.late_minutes, body.scheduled_start, body.note
    )
