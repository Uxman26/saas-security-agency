import os
import secrets
from datetime import date
from typing import List, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models import GuardDocument, Guard
from app.schemas import GuardDocumentCreate
from app.services.company_service import get_company_by_user_id
from app.storage_paths import DOCUMENTS_DIR, ensure_upload_dirs, resolve_storage_path

ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".doc", ".docx"}
MAX_BYTES = 10 * 1024 * 1024


def _guard_in_company(db: Session, guard_id: int, company_id: int) -> Guard:
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company_id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    return guard


def _save_file(guard_id: int, file: UploadFile) -> tuple[str, str]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="File type not allowed")
    raw = file.file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File must be 10 MB or smaller")
    ensure_upload_dirs()
    dest = os.path.join(DOCUMENTS_DIR, f"guard_{guard_id}_{secrets.token_hex(8)}{ext}")
    with open(dest, "wb") as out:
        out.write(raw)
    return dest, file.filename


def get_all_documents(db: Session, user_id: int, guard_id: Optional[int] = None) -> List[GuardDocument]:
    company = get_company_by_user_id(db, user_id)
    q = db.query(GuardDocument).join(Guard).filter(Guard.company_id == company.id)
    if guard_id:
        q = q.filter(GuardDocument.guard_id == guard_id)
    return q.order_by(GuardDocument.created_at.desc()).all()


def create_document(db: Session, guard_id: int, doc: GuardDocumentCreate, user_id: int) -> GuardDocument:
    company = get_company_by_user_id(db, user_id)
    _guard_in_company(db, guard_id, company.id)
    data = doc.model_dump(exclude_unset=True)
    if not data.get("file_path"):
        raise HTTPException(status_code=400, detail="file_path is required")
    db_doc = GuardDocument(guard_id=guard_id, **data)
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc


def upload_documents(
    db: Session,
    user_id: int,
    guard_id: int,
    document_type: str,
    files: List[UploadFile],
    expiry_date: Optional[date] = None,
) -> List[GuardDocument]:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    company = get_company_by_user_id(db, user_id)
    _guard_in_company(db, guard_id, company.id)
    created: list[GuardDocument] = []
    for file in files:
        path, name = _save_file(guard_id, file)
        db_doc = GuardDocument(
            guard_id=guard_id,
            document_type=document_type,
            file_path=path,
            file_name=name,
            expiry_date=expiry_date,
        )
        db.add(db_doc)
        created.append(db_doc)
    db.commit()
    for doc in created:
        db.refresh(doc)
    return created


def get_documents(db: Session, guard_id: int, user_id: int) -> List[GuardDocument]:
    company = get_company_by_user_id(db, user_id)
    _guard_in_company(db, guard_id, company.id)
    return db.query(GuardDocument).filter(GuardDocument.guard_id == guard_id).order_by(GuardDocument.created_at.desc()).all()


def get_expiring(db: Session, user_id: int, days: int = 30) -> List[GuardDocument]:
    company = get_company_by_user_id(db, user_id)
    from datetime import timedelta

    cutoff = date.today() + timedelta(days=days)
    return (
        db.query(GuardDocument)
        .join(Guard)
        .filter(
            Guard.company_id == company.id,
            GuardDocument.expiry_date != None,
            GuardDocument.expiry_date <= cutoff,
        )
        .all()
    )


def get_document_file_path(db: Session, doc_id: int, user_id: int) -> tuple[str, str]:
    company = get_company_by_user_id(db, user_id)
    doc = (
        db.query(GuardDocument)
        .join(Guard)
        .filter(GuardDocument.id == doc_id, Guard.company_id == company.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    path = resolve_storage_path(doc.file_path)
    if not path:
        raise HTTPException(status_code=404, detail="File not found")
    ext = os.path.splitext(path)[1].lower()
    mime = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }.get(ext, "application/octet-stream")
    return path, mime


def delete_document(db: Session, doc_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    doc = (
        db.query(GuardDocument)
        .join(Guard)
        .filter(GuardDocument.id == doc_id, Guard.company_id == company.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    path = resolve_storage_path(doc.file_path)
    if path and os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass
    db.delete(doc)
    db.commit()
