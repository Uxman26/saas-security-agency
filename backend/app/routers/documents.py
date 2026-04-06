from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import User
from app.schemas import GuardDocumentCreate, GuardDocumentCreateFlat, GuardDocumentResponse
from app.rbac import require_perm, PERM_DOC_READ, PERM_DOC_WRITE, PERM_DOC_DELETE
from app.services import guard_document_service

router = APIRouter(prefix="/documents", tags=["documents"])

@router.get("", response_model=List[GuardDocumentResponse])
def list_documents(
    guard_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_DOC_READ)),
):
    return guard_document_service.get_all_documents(db, current_user.id, guard_id)

@router.post("", response_model=GuardDocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(
    doc: GuardDocumentCreateFlat,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_DOC_WRITE)),
):
    doc_data = GuardDocumentCreate(
        document_type=doc.document_type,
        file_path=doc.file_path,
        expiry_date=doc.expiry_date,
    )
    return guard_document_service.create_document(db, doc.guard_id, doc_data, current_user.id)

@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_DOC_DELETE)),
):
    guard_document_service.delete_document(db, doc_id, current_user.id)
    return None


legacy_router = APIRouter(prefix="/guards/{guard_id}/documents", tags=["documents"])

@legacy_router.post("", response_model=GuardDocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document_legacy(guard_id: int, doc: GuardDocumentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_DOC_WRITE))):
    return guard_document_service.create_document(db, guard_id, doc, current_user.id)

@legacy_router.get("", response_model=List[GuardDocumentResponse])
def list_documents_legacy(guard_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_DOC_READ))):
    return guard_document_service.get_documents(db, guard_id, current_user.id)

@legacy_router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document_legacy(guard_id: int, doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_DOC_DELETE))):
    guard_document_service.delete_document(db, doc_id, current_user.id)
    return None
