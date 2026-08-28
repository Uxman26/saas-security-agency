from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AccidentReport, Company, User
from app.rbac import require_module
from app.schemas import AccidentReportCreate, AccidentReportResponse, AccidentReportUpdate
from app.services import accident_pdf, accident_service
from app.services.company_service import get_company_by_user_id

router = APIRouter(prefix="/accident-reports", tags=["accident-reports"])


@router.get("", response_model=List[AccidentReportResponse])
def list_reports(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    site_id: Optional[int] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("accident_reports", "view")),
):
    return accident_service.list_reports(
        db, current_user, start_date, end_date, site_id=site_id, status=status_filter
    )


@router.get("/blank.pdf")
def blank_form(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("accident_reports", "blank_form")),
):
    """A printable empty X-FORM-077, for sites working off paper.

    Declared above /{report_id} so the dynamic route does not swallow it.
    """
    company = get_company_by_user_id(db, current_user.id)
    pdf = accident_pdf.render_accident_pdf(None, company, blank=True)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="accident-report-log-blank.pdf"'},
    )


@router.post("", response_model=AccidentReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(
    body: AccidentReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("accident_reports", "create")),
):
    return accident_service.create_report(db, current_user, body)


@router.get("/{report_id}", response_model=AccidentReportResponse)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("accident_reports", "view")),
):
    return accident_service.get_report(db, current_user, report_id)


@router.get("/{report_id}/pdf")
def report_pdf(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("accident_reports", "pdf_download")),
):
    # Routed through the service so the same scope check guards the PDF as the record.
    out = accident_service.get_report(db, current_user, report_id)
    company = db.query(Company).filter(Company.id == out.company_id).first()
    row = db.query(AccidentReport).filter(AccidentReport.id == report_id).first()
    pdf = accident_pdf.render_accident_pdf(row, company, site_name=out.site_name or "")
    name = (out.reference or f"accident-{report_id}").lower()
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'},
    )


@router.patch("/{report_id}", response_model=AccidentReportResponse)
def update_report(
    report_id: int,
    body: AccidentReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("accident_reports", "edit")),
):
    return accident_service.update_report(db, current_user, report_id, body)


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("accident_reports", "delete")),
):
    accident_service.delete_report(db, current_user, report_id)
    return None
