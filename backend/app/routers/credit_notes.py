from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module
from app.schemas import CreditNoteCreate, CreditNoteResponse, CreditNoteUpdate
from app.services import credit_note_service

router = APIRouter(prefix="/credit-notes", tags=["credit-notes"])


@router.get("", response_model=List[CreditNoteResponse])
def list_credit_notes(
    invoice_id: Optional[int] = None,
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "credit_note_view")),
):
    return credit_note_service.list_credit_notes(
        db, current_user.id, invoice_id=invoice_id, client_id=client_id, status=status
    )


@router.post("", response_model=CreditNoteResponse, status_code=status.HTTP_201_CREATED)
def create_credit_note(
    body: CreditNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "credit_note_create")),
):
    return credit_note_service.create_credit_note(db, body.model_dump(), current_user.id)


@router.get("/{credit_note_id}", response_model=CreditNoteResponse)
def get_credit_note(
    credit_note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "credit_note_view")),
):
    return credit_note_service.get_credit_note(db, credit_note_id, current_user.id)


@router.put("/{credit_note_id}", response_model=CreditNoteResponse)
def update_credit_note(
    credit_note_id: int,
    body: CreditNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "credit_note_edit")),
):
    return credit_note_service.update_credit_note(
        db, credit_note_id, body.model_dump(exclude_unset=True), current_user.id
    )


@router.post("/{credit_note_id}/issue", response_model=CreditNoteResponse)
def issue_credit_note(
    credit_note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "credit_note_edit")),
):
    return credit_note_service.issue_credit_note(db, credit_note_id, current_user.id)


@router.post("/{credit_note_id}/cancel", response_model=CreditNoteResponse)
def cancel_credit_note(
    credit_note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "credit_note_cancel")),
):
    return credit_note_service.cancel_credit_note(db, credit_note_id, current_user.id)


@router.delete("/{credit_note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_credit_note(
    credit_note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("invoices", "credit_note_delete")),
):
    credit_note_service.delete_credit_note(db, credit_note_id, current_user.id)
