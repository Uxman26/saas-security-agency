from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module
from app.schemas import (
    AbsenceCreate,
    AbsenceResponse,
    AbsenceSummaryResponse,
    AbsenceUpdate,
)
from app.services import absence_service

router = APIRouter(prefix="/absence", tags=["absence"])


def _out(db: Session, row) -> AbsenceResponse:
    return AbsenceResponse(
        id=row.id,
        company_id=row.company_id,
        guard_id=row.guard_id,
        kind=row.kind,
        start_date=row.start_date,
        end_date=row.end_date,
        start_time=row.start_time,
        end_time=row.end_time,
        hours=row.hours or 0,
        status=row.status,
        reason=row.reason,
        notes=row.notes,
        created_at=row.created_at,
        guard_name=row.guard.full_name if row.guard else None,
    )


@router.get("", response_model=List[AbsenceResponse])
def list_absences(
    guard_id: Optional[int] = None,
    kind: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("absence", "view")),
):
    """Absences overlapping the window. `kind` is annual_leave, sickness, lateness or other."""
    rows = absence_service.list_absences(
        db, current_user.id, guard_id, kind, start_date, end_date, status_filter
    )
    return [_out(db, r) for r in rows]


@router.get("/summary", response_model=AbsenceSummaryResponse)
def absence_summary(
    guard_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("absence", "view")),
):
    """The four cards on the Absence tab. Defaults to the employee's own leave year.

    Declared above /{absence_id} so the dynamic route does not swallow "summary".
    """
    return absence_service.absence_summary(db, current_user.id, guard_id, start_date, end_date)


@router.post("", response_model=AbsenceResponse, status_code=status.HTTP_201_CREATED)
def create_absence(
    body: AbsenceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("absence", "create")),
):
    row = absence_service.create_absence(db, current_user.id, body.model_dump())
    return _out(db, row)


@router.get("/{absence_id}", response_model=AbsenceResponse)
def get_absence(
    absence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("absence", "view")),
):
    return _out(db, absence_service.get_absence(db, current_user.id, absence_id))


@router.patch("/{absence_id}", response_model=AbsenceResponse)
def update_absence(
    absence_id: int,
    body: AbsenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("absence", "edit")),
):
    row = absence_service.update_absence(
        db, current_user.id, absence_id, body.model_dump(exclude_unset=True)
    )
    return _out(db, row)


@router.delete("/{absence_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_absence(
    absence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("absence", "delete")),
):
    absence_service.delete_absence(db, current_user.id, absence_id)
    return None
