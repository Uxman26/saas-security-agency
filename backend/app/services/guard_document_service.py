import io
import os
import secrets
import zipfile
from datetime import date
from typing import List, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models import GuardDocument, Guard
from app.schemas import GuardDocumentCreate
from app.services.company_service import get_company_by_user_id
from app.storage_paths import DOCUMENTS_DIR, ensure_upload_dirs, resolve_storage_path

ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".doc", ".docx"}
MAX_TOTAL_BYTES = 5 * 1024 * 1024


def _guard_in_company(db: Session, guard_id: int, company_id: int) -> Guard:
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company_id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    return guard


def _read_files(files: List[UploadFile]) -> list[tuple[str, bytes]]:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    items: list[tuple[str, bytes]] = []
    total = 0
    for file in files:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file")
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(status_code=400, detail=f"File type not allowed: {file.filename}")
        raw = file.file.read()
        total += len(raw)
        if total > MAX_TOTAL_BYTES:
            raise HTTPException(status_code=400, detail="Total upload size must be 5 MB or less")
        items.append((file.filename, raw))
    return items


def _unique_zip_name(name: str, used: set[str]) -> str:
    if name not in used:
        used.add(name)
        return name
    base, ext = os.path.splitext(name)
    n = 1
    while True:
        candidate = f"{base}_{n}{ext}"
        if candidate not in used:
            used.add(candidate)
            return candidate
        n += 1


def _store_upload(guard_id: int, document_type: str, items: list[tuple[str, bytes]]) -> tuple[str, str]:
    ensure_upload_dirs()
    if len(items) == 1:
        name, raw = items[0]
        ext = os.path.splitext(name)[1].lower()
        dest = os.path.join(DOCUMENTS_DIR, f"guard_{guard_id}_{secrets.token_hex(8)}{ext}")
        with open(dest, "wb") as out:
            out.write(raw)
        return dest, name

    buf = io.BytesIO()
    used: set[str] = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, raw in items:
            zf.writestr(_unique_zip_name(name, used), raw)
    slug = document_type.replace(" ", "_").replace("/", "-")[:40] or "documents"
    zip_name = f"{slug}_{len(items)}_files.zip"
    dest = os.path.join(DOCUMENTS_DIR, f"guard_{guard_id}_{secrets.token_hex(8)}.zip")
    with open(dest, "wb") as out:
        out.write(buf.getvalue())
    return dest, zip_name


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
    company = get_company_by_user_id(db, user_id)
    _guard_in_company(db, guard_id, company.id)
    items = _read_files(files)
    path, name = _store_upload(guard_id, document_type, items)
    db_doc = GuardDocument(
        guard_id=guard_id,
        document_type=document_type,
        file_path=path,
        file_name=name,
        expiry_date=expiry_date,
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return [db_doc]


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


def get_document_file_path(db: Session, doc_id: int, user_id: int) -> tuple[str, str, str]:
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
        ".zip": "application/zip",
    }.get(ext, "application/octet-stream")
    download_name = doc.file_name or os.path.basename(path)
    return path, mime, download_name


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
