import json
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module, require_platform_perm
from app.services import feedback_service as svc
from app.services.company_service import get_company_by_user_id

router = APIRouter(prefix="/feedback", tags=["feedback"])
admin_router = APIRouter(prefix="/admin/feedback", tags=["admin-feedback"])


class ReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=8000)


class StatusIn(BaseModel):
    status: str


@router.get("")
def tenant_list(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_internal_module("feedback", "view")),
):
    return svc.list_tenant(db, user, status=status)


@router.get("/attachments/{attachment_id}/file")
def tenant_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_internal_module("feedback", "view")),
):
    company = get_company_by_user_id(db, user.id)
    path, name, ctype = svc.attachment_path(db, attachment_id, company_id=company.id)
    return FileResponse(path, filename=name, media_type=ctype or "application/octet-stream")


@router.get("/{submission_id}")
def tenant_get(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_internal_module("feedback", "view")),
):
    return svc.get_tenant(db, user, submission_id)


@router.post("")
async def tenant_create(
    category: str = Form(...),
    subject: str = Form(...),
    description: str = Form(...),
    diagnostic_json: Optional[str] = Form(None),
    files: Optional[list[UploadFile]] = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_internal_module("feedback", "create")),
):
    diagnostic = None
    if diagnostic_json:
        try:
            diagnostic = json.loads(diagnostic_json)
        except (TypeError, json.JSONDecodeError):
            diagnostic = None
    return await svc.create_tenant(
        db,
        user,
        category=category,
        subject=subject,
        description=description,
        diagnostic=diagnostic if isinstance(diagnostic, dict) else None,
        files=files,
    )


@router.post("/{submission_id}/messages")
def tenant_reply(
    submission_id: int,
    body: ReplyIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_internal_module("feedback", "create")),
):
    return svc.reply_tenant(db, user, submission_id, body.body)


@admin_router.get("")
def admin_list(
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("support.read")),
):
    return svc.list_admin(db, company_id=company_id, status=status, category=category, q=q)


@admin_router.get("/attachments/{attachment_id}/file")
def admin_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("support.read")),
):
    path, name, ctype = svc.attachment_path(db, attachment_id)
    return FileResponse(path, filename=name, media_type=ctype or "application/octet-stream")


@admin_router.get("/{submission_id}")
def admin_get(
    submission_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("support.read")),
):
    return svc.get_admin(db, submission_id)


@admin_router.post("/{submission_id}/messages")
def admin_reply(
    submission_id: int,
    body: ReplyIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_platform_perm("support.write")),
):
    return svc.reply_admin(db, user, submission_id, body.body)


@admin_router.patch("/{submission_id}/status")
def admin_status(
    submission_id: int,
    body: StatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_platform_perm("support.write")),
):
    return svc.set_status(db, user, submission_id, body.status)


@admin_router.delete("/{submission_id}")
def admin_delete(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_platform_perm("support.write")),
):
    return svc.delete_admin(db, user, submission_id)
