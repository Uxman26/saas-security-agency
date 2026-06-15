from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import PERM_EXP_DELETE, PERM_EXP_READ, PERM_EXP_WRITE, require_perm
from app.schemas import (
    ExpenseCreate,
    ExpenseDashboardResponse,
    ExpenseReportResponse,
    ExpenseResponse,
    ExpenseUpdate,
    VatReportResponse,
)
from app.services import expense_service

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("/meta")
def expense_meta(_: User = Depends(require_perm(PERM_EXP_READ))):
    return {
        "categories": expense_service.EXPENSE_CATEGORIES,
        "payment_methods": expense_service.PAYMENT_METHODS,
        "payment_statuses": expense_service.PAYMENT_STATUSES,
        "vat_rate": expense_service.VAT_RATE,
        "max_document_bytes": expense_service.MAX_DOC_BYTES,
    }


@router.get("/dashboard", response_model=ExpenseDashboardResponse)
def dashboard(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_READ)),
):
    return expense_service.dashboard_summary(db, current_user.id, start_date, end_date)


@router.get("/reports/expenses", response_model=ExpenseReportResponse)
def expense_report(
    start_date: date,
    end_date: date,
    group_by: str = "category",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_READ)),
):
    if group_by not in ("category", "vendor", "month"):
        group_by = "category"
    return expense_service.expense_report(db, current_user.id, start_date, end_date, group_by)


@router.get("/reports/vat", response_model=VatReportResponse)
def vat_report(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_READ)),
):
    return expense_service.vat_report(db, current_user.id, start_date, end_date)


@router.get("", response_model=List[ExpenseResponse])
def list_expenses(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category: Optional[str] = None,
    payment_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_READ)),
):
    return expense_service.list_expenses(db, current_user.id, start_date, end_date, category, payment_status)


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(
    data: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_WRITE)),
):
    return expense_service.create_expense(db, data, current_user.id)


@router.get("/{expense_id}", response_model=ExpenseResponse)
def get_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_READ)),
):
    return expense_service.get_expense(db, expense_id, current_user.id)


@router.put("/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    expense_id: int,
    data: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_WRITE)),
):
    return expense_service.update_expense(db, expense_id, data, current_user.id)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_DELETE)),
):
    expense_service.delete_expense(db, expense_id, current_user.id)
    return None


@router.post("/{expense_id}/document", response_model=ExpenseResponse)
def upload_document(
    expense_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_WRITE)),
):
    return expense_service.save_expense_document(db, expense_id, file, current_user.id)


@router.get("/{expense_id}/document")
def download_document(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_READ)),
):
    path, mime = expense_service.get_expense_document_path(db, expense_id, current_user.id)
    return FileResponse(path, media_type=mime)


@router.delete("/{expense_id}/document", response_model=ExpenseResponse)
def remove_document(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_EXP_WRITE)),
):
    return expense_service.delete_expense_document(db, expense_id, current_user.id)
