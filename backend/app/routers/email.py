from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import PERM_EMAIL_SEND, require_perm
from app.schemas import (
    EmailConfigResponse,
    EmailConfigUpdate,
    EmailLogResponse,
    EmailRequest,
    EmailTestRequest,
)
from app.services import email_config_service

router = APIRouter(prefix="/email", tags=["email"])


@router.get("/config", response_model=EmailConfigResponse)
def get_config(db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_EMAIL_SEND))):
    return EmailConfigResponse(**email_config_service.get_email_config(db, current_user.id))


@router.patch("/config", response_model=EmailConfigResponse)
def patch_config(body: EmailConfigUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_EMAIL_SEND))):
    return EmailConfigResponse(**email_config_service.update_email_config(db, current_user.id, body.model_dump(exclude_unset=True)))


@router.post("/send", status_code=status.HTTP_200_OK, response_model=EmailLogResponse)
def send_email(email_data: EmailRequest, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_EMAIL_SEND))):
    log = email_config_service.send_tenant_email(
        db, current_user.id, email_data.to_email, email_data.subject, email_data.body
    )
    return EmailLogResponse.model_validate(log)


@router.post("/test", response_model=EmailLogResponse)
def test_email(body: EmailTestRequest, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_EMAIL_SEND))):
    subject = body.subject or "Test email"
    content = body.body or "<p>This is a test email from SecureForce Manager.</p>"
    log = email_config_service.send_tenant_email(db, current_user.id, body.to_email, subject, content, "alert")
    return EmailLogResponse.model_validate(log)


@router.get("/logs", response_model=List[EmailLogResponse])
def email_logs(db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_EMAIL_SEND))):
    return [EmailLogResponse.model_validate(r) for r in email_config_service.list_email_logs(db, current_user.id)]
