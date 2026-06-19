from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

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
        file_name=doc.file_name,
        expiry_date=doc.expiry_date,
    )
    return guard_document_service.create_document(db, doc.guard_id, doc_data, current_user.id)


@router.post("/upload", response_model=List[GuardDocumentResponse], status_code=status.HTTP_201_CREATED)
def upload_documents(
    guard_id: int = Form(...),
    document_type: str = Form(...),
    expiry_date: Optional[date] = Form(None),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_DOC_WRITE)),
):
    return guard_document_service.upload_documents(db, current_user.id, guard_id, document_type, files, expiry_date)


@router.get("/{doc_id}/file")
def download_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_DOC_READ)),
):
    path, mime, filename = guard_document_service.get_document_file_path(db, doc_id, current_user.id)
    return FileResponse(path, media_type=mime, filename=filename)


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
def create_document_legacy(
    guard_id: int,
    doc: GuardDocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_DOC_WRITE)),
):
    return guard_document_service.create_document(db, guard_id, doc, current_user.id)


@legacy_router.post("/upload", response_model=List[GuardDocumentResponse], status_code=status.HTTP_201_CREATED)
def upload_documents_legacy(
    guard_id: int,
    document_type: str = Form(...),
    expiry_date: Optional[date] = Form(None),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_DOC_WRITE)),
):
    return guard_document_service.upload_documents(db, current_user.id, guard_id, document_type, files, expiry_date)


@legacy_router.get("", response_model=List[GuardDocumentResponse])
def list_documents_legacy(
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_DOC_READ)),
):
    return guard_document_service.get_documents(db, guard_id, current_user.id)


@legacy_router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document_legacy(
    guard_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_DOC_DELETE)),
):
    guard_document_service.delete_document(db, doc_id, current_user.id)
    return None
