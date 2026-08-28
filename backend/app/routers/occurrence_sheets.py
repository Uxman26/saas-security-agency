from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Company, OccurrenceSheet, User
from app.rbac import require_module
from app.schemas import (
    OccurrenceSheetCreate,
    OccurrenceSheetResponse,
    OccurrenceSheetUpdate,
)
from app.services import occurrence_pdf, occurrence_service
from app.services.company_service import get_company_by_user_id

router = APIRouter(prefix="/occurrence-sheets", tags=["occurrence-sheets"])


@router.get("", response_model=List[OccurrenceSheetResponse])
def list_sheets(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    site_id: Optional[int] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("occurrence_sheets", "view")),
):
    return occurrence_service.list_sheets(
        db, current_user, start_date, end_date, site_id, status_filter
    )


@router.get("/blank.pdf")
def blank_sheet(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("occurrence_sheets", "blank_form")),
):
    """Printable empty sheet. Above /{sheet_id} so it is not read as an id."""
    company = get_company_by_user_id(db, current_user.id)
    pdf = occurrence_pdf.render_occurrence_pdf(None, company, blank=True)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="daily-occurrences-sheet-blank.pdf"'},
    )


@router.post("", response_model=OccurrenceSheetResponse, status_code=status.HTTP_201_CREATED)
def create_sheet(
    body: OccurrenceSheetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("occurrence_sheets", "create")),
):
    return occurrence_service.create_sheet(db, current_user, body)


@router.get("/{sheet_id}", response_model=OccurrenceSheetResponse)
def get_sheet(
    sheet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("occurrence_sheets", "view")),
):
    return occurrence_service.get_sheet(db, current_user, sheet_id)


@router.get("/{sheet_id}/pdf")
def sheet_pdf(
    sheet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("occurrence_sheets", "pdf_download")),
):
    out = occurrence_service.get_sheet(db, current_user, sheet_id)
    company = db.query(Company).filter(Company.id == out.company_id).first()
    row = db.query(OccurrenceSheet).filter(OccurrenceSheet.id == sheet_id).first()
    pdf = occurrence_pdf.render_occurrence_pdf(row, company, site_name=out.site_name or "")
    name = (out.reference or f"occurrences-{sheet_id}").lower()
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'},
    )


@router.patch("/{sheet_id}", response_model=OccurrenceSheetResponse)
def update_sheet(
    sheet_id: int,
    body: OccurrenceSheetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("occurrence_sheets", "edit")),
):
    return occurrence_service.update_sheet(db, current_user, sheet_id, body)


@router.delete("/{sheet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sheet(
    sheet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("occurrence_sheets", "delete")),
):
    occurrence_service.delete_sheet(db, current_user, sheet_id)
    return None
