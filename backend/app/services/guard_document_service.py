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
from app.services.image_avif_service import (
    AVIF_EXT,
    AVIF_MIME,
    IMAGE_INPUT_EXT,
    avif_filename,
    encode_avif_bytes,
    is_image_filename,
)

ALLOWED_EXT = {".pdf", ".doc", ".docx", AVIF_EXT} | IMAGE_INPUT_EXT
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
        if ext not in ALLOWED_EXT and not (is_image_filename(file.filename) or ext in {".pdf", ".doc", ".docx"}):
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


def _as_stored_file(name: str, raw: bytes) -> tuple[str, bytes]:
    ext = os.path.splitext(name)[1].lower()
    if is_image_filename(name) and ext != AVIF_EXT:
        return avif_filename(name), encode_avif_bytes(raw)
    return name, raw


def _store_upload(guard_id: int, document_type: str, items: list[tuple[str, bytes]]) -> tuple[str, str]:
    ensure_upload_dirs()
    if len(items) == 1:
        name, raw = items[0]
        stored_name, stored_raw = _as_stored_file(name, raw)
        ext = os.path.splitext(stored_name)[1].lower()
        dest = os.path.join(DOCUMENTS_DIR, f"guard_{guard_id}_{secrets.token_hex(8)}{ext}")
        with open(dest, "wb") as out:
            out.write(stored_raw)
        return dest, stored_name

    buf = io.BytesIO()
    used: set[str] = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, raw in items:
            stored_name, stored_raw = _as_stored_file(name, raw)
            zf.writestr(_unique_zip_name(stored_name, used), stored_raw)
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
    folder: Optional[str] = None,
    follow_up_date: Optional[date] = None,
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
        folder=(folder or "").strip() or None,
        follow_up_date=follow_up_date,
        # Recorded at upload so the Details panel can show size and type without going
        # back to disk — and so it still reads correctly if the file is ever moved.
        file_size=sum(len(raw) for _n, raw in items),
        mime_type=mime_for_filename(name),
        uploaded_by_user_id=user_id,
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


# Extension → mime. Anything not listed downloads rather than previews, which is what
# the "Preview unavailable for this file type" panel is telling the user.
_MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".zip": "application/zip",
}

# What the browser can render in the page itself. Everything else gets the download
# prompt instead of an empty frame.
PREVIEWABLE_MIMES = frozenset(
    {"application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", AVIF_MIME}
)


def mime_for_filename(name: Optional[str]) -> str:
    ext = os.path.splitext(name or "")[1].lower()
    if ext == AVIF_EXT:
        return AVIF_MIME
    return _MIME_BY_EXT.get(ext, "application/octet-stream")


def document_detail(db: Session, doc_id: int, user_id: int) -> dict:
    """Everything the Documents screens show about one file.

    ``previewable`` is decided here rather than in the browser so both screens agree on
    when to offer an in-page preview and when to say it is unavailable.
    """
    company = get_company_by_user_id(db, user_id)
    doc = (
        db.query(GuardDocument)
        .join(Guard)
        .filter(GuardDocument.id == doc_id, Guard.company_id == company.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    mime = doc.mime_type or mime_for_filename(doc.file_name)
    size = doc.file_size
    if size is None:
        # Older rows predate the stored size; read it off disk rather than show a blank.
        path = resolve_storage_path(doc.file_path)
        if path and os.path.exists(path):
            size = os.path.getsize(path)
    uploader = None
    if doc.uploaded_by_user_id:
        from app.models import User

        row = db.query(User).filter(User.id == doc.uploaded_by_user_id).first()
        uploader = row.full_name if row else None
    if not uploader:
        uploader = company.name
    return {
        "id": doc.id,
        "guard_id": doc.guard_id,
        "guard_name": doc.guard.full_name if doc.guard else None,
        "document_type": doc.document_type,
        "file_name": doc.file_name,
        "folder": doc.folder,
        "file_type": _friendly_type(mime, doc.file_name),
        "mime_type": mime,
        "file_size": size,
        "previewable": mime in PREVIEWABLE_MIMES,
        "expiry_date": doc.expiry_date,
        "follow_up_date": doc.follow_up_date,
        "visible_to_employee": bool(doc.visible_to_employee),
        "requires_acceptance": bool(doc.requires_acceptance),
        "uploaded_by": uploader,
        "created_at": doc.created_at,
    }


def _friendly_type(mime: str, name: Optional[str]) -> str:
    """The short label the Information panel shows — "Word", "Pdf", "Image"."""
    if mime == "application/pdf":
        return "Pdf"
    if "wordprocessingml" in mime or mime == "application/msword":
        return "Word"
    if "spreadsheetml" in mime or mime == "application/vnd.ms-excel":
        return "Excel"
    if mime.startswith("image/"):
        return "Image"
    if mime.startswith("text/"):
        return "Text"
    ext = os.path.splitext(name or "")[1].lstrip(".").upper()
    return ext or "File"


def update_document_settings(db: Session, doc_id: int, user_id: int, data: dict) -> dict:
    """The Settings tab: folder, dates, and who may see or must accept the document."""
    company = get_company_by_user_id(db, user_id)
    doc = (
        db.query(GuardDocument)
        .join(Guard)
        .filter(GuardDocument.id == doc_id, Guard.company_id == company.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if "folder" in data:
        doc.folder = (data.get("folder") or "").strip() or None
    if "document_type" in data and data["document_type"]:
        doc.document_type = str(data["document_type"]).strip()
    for field in ("expiry_date", "follow_up_date"):
        if field in data:
            setattr(doc, field, data[field])
    for field in ("visible_to_employee", "requires_acceptance"):
        if field in data and data[field] is not None:
            setattr(doc, field, bool(data[field]))
    db.commit()
    return document_detail(db, doc_id, user_id)


def list_receipts(db: Session, doc_id: int, user_id: int) -> list[dict]:
    """Who has read the document, and who has accepted it.

    Everyone the document is aimed at is listed, read or not — an empty row is the point
    of a read-receipt screen, so people who have not opened it are the ones you chase.
    """
    from app.models import DocumentReadReceipt, User

    company = get_company_by_user_id(db, user_id)
    doc = (
        db.query(GuardDocument)
        .join(Guard)
        .filter(GuardDocument.id == doc_id, Guard.company_id == company.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    receipts = {
        r.user_id: r
        for r in db.query(DocumentReadReceipt).filter(DocumentReadReceipt.document_id == doc_id).all()
    }
    audience = (
        db.query(User)
        .filter(User.company_id == company.id, User.guard_id == doc.guard_id)
        .order_by(User.email)
        .all()
    )
    out = []
    for u in audience:
        r = receipts.get(u.id)
        out.append(
            {
                "user_id": u.id,
                "name": u.full_name,
                "email": u.email,
                "read_at": r.read_at if r else None,
                "accepted_at": r.accepted_at if r else None,
            }
        )
    # Anyone who read it but is not in the audience any more still shows, so the trail is
    # complete rather than tidy.
    seen = {u.id for u in audience}
    for uid, r in receipts.items():
        if uid in seen:
            continue
        u = db.query(User).filter(User.id == uid).first()
        out.append(
            {
                "user_id": uid,
                "name": u.full_name if u else f"User #{uid}",
                "email": u.email if u else None,
                "read_at": r.read_at,
                "accepted_at": r.accepted_at,
            }
        )
    return out


def record_receipt(db: Session, doc_id: int, user_id: int, accept: bool = False) -> dict:
    """Stamps that the caller has opened — and optionally accepted — the document."""
    from datetime import datetime, timezone

    from app.models import DocumentReadReceipt

    company = get_company_by_user_id(db, user_id)
    doc = (
        db.query(GuardDocument)
        .join(Guard)
        .filter(GuardDocument.id == doc_id, Guard.company_id == company.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if accept and not doc.requires_acceptance:
        raise HTTPException(status_code=400, detail="This document does not ask for acceptance")
    row = (
        db.query(DocumentReadReceipt)
        .filter(DocumentReadReceipt.document_id == doc_id, DocumentReadReceipt.user_id == user_id)
        .first()
    )
    now = datetime.now(timezone.utc)
    if not row:
        row = DocumentReadReceipt(document_id=doc_id, user_id=user_id)
        db.add(row)
    # First open wins: re-reading does not reset when they first saw it.
    if row.read_at is None:
        row.read_at = now
    if accept and row.accepted_at is None:
        row.accepted_at = now
    db.commit()
    db.refresh(row)
    return {"user_id": user_id, "read_at": row.read_at, "accepted_at": row.accepted_at}


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
    mime = doc.mime_type or mime_for_filename(doc.file_name or os.path.basename(path))
    if mime == "application/octet-stream":
        mime = mime_for_filename(os.path.basename(path))
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
