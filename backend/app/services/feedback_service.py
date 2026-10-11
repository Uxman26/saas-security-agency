from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import (
    AppNotification,
    Company,
    FeedbackAttachment,
    FeedbackMessage,
    FeedbackSubmission,
    User,
)
from app.services.company_service import get_company_by_user_id
from app.services import email_service
from app.storage_paths import FEEDBACK_DIR, ensure_upload_dirs, resolve_storage_path

CATEGORIES = {"suggestion", "complaint", "technical_issue", "application_crash", "other"}
STATUSES = {"open", "in_progress", "closed"}
MAX_TOTAL_BYTES = 5 * 1024 * 1024
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
MAGIC = {
    ".pdf": (b"%PDF",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".webp": (b"RIFF",),
}


def _now():
    return datetime.now(timezone.utc)


def _ref(db: Session) -> str:
    n = db.query(FeedbackSubmission).count() + 1
    return f"FB-{n:06d}"


def _validate_bytes(filename: str, content_type: str | None, raw: bytes) -> str:
    if not filename or not raw:
        raise HTTPException(status_code=400, detail="Empty or invalid file")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {filename}")
    mime = (content_type or "").lower().split(";")[0].strip()
    if mime and mime not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"Unsupported MIME type for {filename}")
    sigs = MAGIC.get(ext) or ()
    if not any(raw.startswith(s) for s in sigs):
        raise HTTPException(status_code=400, detail=f"File content does not match type: {filename}")
    if ext == ".webp" and (len(raw) < 12 or raw[8:12] != b"WEBP"):
        raise HTTPException(status_code=400, detail=f"Invalid WEBP file: {filename}")
    return ext


async def _read_files(files: list[UploadFile] | None) -> list[tuple[str, str | None, bytes]]:
    if not files:
        return []
    out: list[tuple[str, str | None, bytes]] = []
    total = 0
    for f in files:
        if not f or not f.filename:
            continue
        raw = await f.read()
        _validate_bytes(f.filename, f.content_type, raw)
        total += len(raw)
        if total > MAX_TOTAL_BYTES:
            raise HTTPException(status_code=400, detail="Combined attachments must be 5 MB or less")
        out.append((f.filename, f.content_type, raw))
    return out


def _notify(
    db: Session,
    *,
    company_id: int,
    user_id: int,
    kind: str,
    title: str,
    body: str = "",
    entity_id: Optional[int] = None,
) -> None:
    since = _now() - timedelta(hours=24)
    dup = (
        db.query(AppNotification.id)
        .filter(
            AppNotification.company_id == company_id,
            AppNotification.user_id == user_id,
            AppNotification.kind == kind,
            AppNotification.entity_type == "feedback",
            AppNotification.entity_id == entity_id,
            AppNotification.read_at.is_(None),
            AppNotification.created_at >= since,
        )
        .first()
    )
    if dup:
        return
    db.add(
        AppNotification(
            company_id=company_id,
            user_id=user_id,
            kind=kind,
            title=title,
            body=body,
            entity_type="feedback",
            entity_id=entity_id,
        )
    )


def _notify_super_admins_email(subject: str, body: str) -> None:
    to = (settings.super_admin_email or settings.mail_from or "").strip()
    if not to:
        return
    try:
        email_service.send_email_async(to, subject, body)
    except Exception:
        pass


def _company_contact(company: Company, submitter: User | None) -> dict[str, Any]:
    admin = company.admin if hasattr(company, "admin") and company.admin else None
    return {
        "company_id": company.id,
        "company_name": company.name,
        "contact_person": (admin.full_name if admin else None) or (submitter.full_name if submitter else None),
        "contact_email": company.email or (admin.email if admin else None) or (submitter.email if submitter else None),
        "contact_phone": company.phone,
    }


def _out(row: FeedbackSubmission, *, include_detail: bool = False) -> dict[str, Any]:
    submitter = row.created_by
    company = row.company
    data: dict[str, Any] = {
        "id": row.id,
        "reference": row.reference,
        "company_id": row.company_id,
        "company_name": company.name if company else None,
        "created_by_user_id": row.created_by_user_id,
        "submitted_by": submitter.full_name if submitter else None,
        "submitted_by_email": submitter.email if submitter else None,
        "category": row.category,
        "subject": row.subject,
        "status": row.status,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "closed_at": row.closed_at,
        "message_count": len(row.messages) if row.messages is not None else 0,
        "attachment_count": len(row.attachments) if row.attachments is not None else 0,
    }
    if include_detail:
        data["description"] = row.description
        data["diagnostic"] = None
        if row.diagnostic_json:
            try:
                data["diagnostic"] = json.loads(row.diagnostic_json)
            except (TypeError, json.JSONDecodeError):
                data["diagnostic"] = None
        if company:
            data["tenant"] = _company_contact(company, submitter)
        data["messages"] = [
            {
                "id": m.id,
                "author_user_id": m.author_user_id,
                "author_name": m.author.full_name if m.author else None,
                "author_email": m.author.email if m.author else None,
                "body": m.body,
                "is_staff": bool(m.is_staff),
                "created_at": m.created_at,
            }
            for m in sorted(row.messages or [], key=lambda x: x.id)
        ]
        data["attachments"] = [
            {
                "id": a.id,
                "file_name": a.file_name,
                "content_type": a.content_type,
                "size_bytes": a.size_bytes,
                "created_at": a.created_at,
            }
            for a in (row.attachments or [])
        ]
    return data


def _load(db: Session, submission_id: int, *, company_id: Optional[int] = None) -> FeedbackSubmission:
    q = (
        db.query(FeedbackSubmission)
        .options(
            joinedload(FeedbackSubmission.company).joinedload(Company.admin),
            joinedload(FeedbackSubmission.created_by),
            joinedload(FeedbackSubmission.messages).joinedload(FeedbackMessage.author),
            joinedload(FeedbackSubmission.attachments),
        )
        .filter(FeedbackSubmission.id == submission_id, FeedbackSubmission.deleted_at.is_(None))
    )
    if company_id is not None:
        q = q.filter(FeedbackSubmission.company_id == company_id)
    row = q.first()
    if not row:
        raise HTTPException(status_code=404, detail="Submission not found")
    return row


def list_tenant(db: Session, user: User, *, status: Optional[str] = None) -> list[dict]:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(FeedbackSubmission)
        .options(
            joinedload(FeedbackSubmission.company),
            joinedload(FeedbackSubmission.created_by),
            joinedload(FeedbackSubmission.messages),
            joinedload(FeedbackSubmission.attachments),
        )
        .filter(FeedbackSubmission.company_id == company.id, FeedbackSubmission.deleted_at.is_(None))
    )
    if status and status in STATUSES:
        q = q.filter(FeedbackSubmission.status == status)
    rows = q.order_by(FeedbackSubmission.id.desc()).limit(200).all()
    return [_out(r) for r in rows]


def get_tenant(db: Session, user: User, submission_id: int) -> dict:
    company = get_company_by_user_id(db, user.id)
    return _out(_load(db, submission_id, company_id=company.id), include_detail=True)


async def create_tenant(
    db: Session,
    user: User,
    *,
    category: str,
    subject: str,
    description: str,
    diagnostic: Optional[dict] = None,
    files: list[UploadFile] | None = None,
) -> dict:
    company = get_company_by_user_id(db, user.id)
    cat = (category or "").strip().lower()
    if cat not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    subj = (subject or "").strip()
    desc = (description or "").strip()
    if len(subj) < 3:
        raise HTTPException(status_code=400, detail="Subject is required")
    if len(desc) < 10:
        raise HTTPException(status_code=400, detail="Description is required")
    file_items = await _read_files(files)
    safe_diag = None
    if diagnostic and isinstance(diagnostic, dict):
        banned = {"password", "token", "authorization", "secret", "card", "cvv", "private_key", "api_key"}
        safe_diag = {k: v for k, v in diagnostic.items() if str(k).lower() not in banned and not isinstance(v, (dict, list))}
    row = FeedbackSubmission(
        reference=_ref(db),
        company_id=company.id,
        created_by_user_id=user.id,
        category=cat,
        subject=subj[:200],
        description=desc[:20000],
        status="open",
        diagnostic_json=json.dumps(safe_diag) if safe_diag else None,
    )
    db.add(row)
    db.flush()
    ensure_upload_dirs()
    for name, ctype, raw in file_items:
        ext = os.path.splitext(name)[1].lower()
        stored = f"{row.id}_{uuid.uuid4().hex}{ext}"
        path = os.path.join(FEEDBACK_DIR, stored)
        with open(path, "wb") as fh:
            fh.write(raw)
        db.add(
            FeedbackAttachment(
                submission_id=row.id,
                file_name=os.path.basename(name)[:255],
                file_path=path,
                content_type=ctype,
                size_bytes=len(raw),
                uploaded_by_user_id=user.id,
            )
        )
    db.commit()
    _notify_super_admins_email(
        f"[Feedback] {row.reference}: {row.subject}",
        f"Tenant: {company.name} (#{company.id})\nFrom: {user.full_name} <{user.email}>\nCategory: {row.category}\n\n{row.description[:2000]}",
    )
    return get_tenant(db, user, row.id)


def reply_tenant(db: Session, user: User, submission_id: int, body: str) -> dict:
    company = get_company_by_user_id(db, user.id)
    row = _load(db, submission_id, company_id=company.id)
    if row.status == "closed":
        raise HTTPException(status_code=400, detail="Submission is closed")
    text = (body or "").strip()
    if len(text) < 1:
        raise HTTPException(status_code=400, detail="Reply is required")
    db.add(FeedbackMessage(submission_id=row.id, author_user_id=user.id, body=text[:8000], is_staff=False))
    if row.status == "open":
        row.status = "in_progress"
    row.updated_at = _now()
    db.commit()
    return get_tenant(db, user, row.id)


def list_admin(
    db: Session,
    *,
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
) -> list[dict]:
    query = (
        db.query(FeedbackSubmission)
        .options(
            joinedload(FeedbackSubmission.company),
            joinedload(FeedbackSubmission.created_by),
            joinedload(FeedbackSubmission.messages),
            joinedload(FeedbackSubmission.attachments),
        )
        .filter(FeedbackSubmission.deleted_at.is_(None))
    )
    if company_id:
        query = query.filter(FeedbackSubmission.company_id == company_id)
    if status and status in STATUSES:
        query = query.filter(FeedbackSubmission.status == status)
    if category and category in CATEGORIES:
        query = query.filter(FeedbackSubmission.category == category)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            (FeedbackSubmission.reference.ilike(like))
            | (FeedbackSubmission.subject.ilike(like))
            | (FeedbackSubmission.description.ilike(like))
        )
    rows = query.order_by(FeedbackSubmission.id.desc()).limit(500).all()
    return [_out(r) for r in rows]


def get_admin(db: Session, submission_id: int) -> dict:
    return _out(_load(db, submission_id), include_detail=True)


def reply_admin(db: Session, actor: User, submission_id: int, body: str) -> dict:
    row = _load(db, submission_id)
    text = (body or "").strip()
    if len(text) < 1:
        raise HTTPException(status_code=400, detail="Reply is required")
    db.add(FeedbackMessage(submission_id=row.id, author_user_id=actor.id, body=text[:8000], is_staff=True))
    if row.status == "open":
        row.status = "in_progress"
    row.updated_at = _now()
    _notify(
        db,
        company_id=row.company_id,
        user_id=row.created_by_user_id,
        kind="feedback_reply",
        title=f"Reply on {row.reference}",
        body=text[:240],
        entity_id=row.id,
    )
    db.commit()
    return get_admin(db, row.id)


def set_status(db: Session, actor: User, submission_id: int, status: str) -> dict:
    row = _load(db, submission_id)
    st = (status or "").strip().lower()
    if st not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    row.status = st
    row.updated_at = _now()
    if st == "closed":
        row.closed_at = _now()
        row.closed_by_user_id = actor.id
        _notify(
            db,
            company_id=row.company_id,
            user_id=row.created_by_user_id,
            kind="feedback_closed",
            title=f"{row.reference} closed",
            body=row.subject,
            entity_id=row.id,
        )
    else:
        row.closed_at = None
        row.closed_by_user_id = None
    db.commit()
    return get_admin(db, row.id)


def delete_admin(db: Session, actor: User, submission_id: int) -> dict:
    row = _load(db, submission_id)
    row.deleted_at = _now()
    row.deleted_by_user_id = actor.id
    row.updated_at = _now()
    db.commit()
    return {"id": submission_id, "deleted": True}


def attachment_path(db: Session, attachment_id: int, *, company_id: Optional[int] = None) -> tuple[str, str, str | None]:
    q = (
        db.query(FeedbackAttachment)
        .join(FeedbackSubmission, FeedbackSubmission.id == FeedbackAttachment.submission_id)
        .filter(FeedbackAttachment.id == attachment_id, FeedbackSubmission.deleted_at.is_(None))
    )
    if company_id is not None:
        q = q.filter(FeedbackSubmission.company_id == company_id)
    att = q.first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = resolve_storage_path(att.file_path)
    if not path:
        raise HTTPException(status_code=404, detail="File missing")
    return path, att.file_name, att.content_type
