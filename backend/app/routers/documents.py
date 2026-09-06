from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import (
    DocumentDetailResponse,
    DocumentReceiptRow,
    DocumentSettingsUpdate,
    GuardDocumentCreate,
    GuardDocumentCreateFlat,
    GuardDocumentResponse,
)
from app.rbac import require_internal_module
from app.services import guard_document_service

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=List[GuardDocumentResponse])
def list_documents(
    guard_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "view")),
):
    return guard_document_service.get_all_documents(db, current_user.id, guard_id)


@router.post("", response_model=GuardDocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(
    doc: GuardDocumentCreateFlat,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "create")),
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
    folder: Optional[str] = Form(None),
    follow_up_date: Optional[date] = Form(None),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "upload")),
):
    return guard_document_service.upload_documents(
        db,
        current_user.id,
        guard_id,
        document_type,
        files,
        expiry_date,
        folder=folder,
        follow_up_date=follow_up_date,
    )


@router.get("/{doc_id}/detail", response_model=DocumentDetailResponse)
def document_detail(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "view")),
):
    """Everything the Details tab shows, including whether it can be previewed in page."""
    return guard_document_service.document_detail(db, doc_id, current_user.id)


@router.patch("/{doc_id}/settings", response_model=DocumentDetailResponse)
def update_document_settings(
    doc_id: int,
    body: DocumentSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "create")),
):
    """The Settings tab: folder, type, expiry, follow-up, visibility and acceptance."""
    return guard_document_service.update_document_settings(
        db, doc_id, current_user.id, body.model_dump(exclude_unset=True)
    )


@router.get("/{doc_id}/receipts", response_model=List[DocumentReceiptRow])
def document_receipts(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "view")),
):
    """Read receipts & acceptance. Everyone the document is aimed at, read or not."""
    return guard_document_service.list_receipts(db, doc_id, current_user.id)


@router.post("/{doc_id}/receipts", response_model=DocumentReceiptRow)
def record_document_receipt(
    doc_id: int,
    accept: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "view")),
):
    """Stamps that the caller has opened, and optionally accepted, this document."""
    row = guard_document_service.record_receipt(db, doc_id, current_user.id, accept)
    return DocumentReceiptRow(
        user_id=row["user_id"],
        name=current_user.full_name,
        email=current_user.email,
        read_at=row["read_at"],
        accepted_at=row["accepted_at"],
    )


@router.get("/{doc_id}/preview")
def preview_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "download")),
):
    """The file served inline, for the in-page preview.

    Same bytes as the download, without the attachment disposition, so a PDF renders in
    the page instead of being saved.
    """
    path, mime, _filename = guard_document_service.get_document_file_path(db, doc_id, current_user.id)
    return FileResponse(path, media_type=mime)


@router.get("/{doc_id}/file")
def download_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "download")),
):
    path, mime, filename = guard_document_service.get_document_file_path(db, doc_id, current_user.id)
    return FileResponse(path, media_type=mime, filename=filename)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "delete")),
):
    guard_document_service.delete_document(db, doc_id, current_user.id)
    return None


legacy_router = APIRouter(prefix="/guards/{guard_id}/documents", tags=["documents"])


@legacy_router.post("", response_model=GuardDocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document_legacy(
    guard_id: int,
    doc: GuardDocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "create")),
):
    return guard_document_service.create_document(db, guard_id, doc, current_user.id)


@legacy_router.post("/upload", response_model=List[GuardDocumentResponse], status_code=status.HTTP_201_CREATED)
def upload_documents_legacy(
    guard_id: int,
    document_type: str = Form(...),
    expiry_date: Optional[date] = Form(None),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "upload")),
):
    return guard_document_service.upload_documents(db, current_user.id, guard_id, document_type, files, expiry_date)


@legacy_router.get("", response_model=List[GuardDocumentResponse])
def list_documents_legacy(
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "view")),
):
    return guard_document_service.get_documents(db, guard_id, current_user.id)


@legacy_router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document_legacy(
    guard_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("documents", "delete")),
):
    guard_document_service.delete_document(db, doc_id, current_user.id)
    return None
