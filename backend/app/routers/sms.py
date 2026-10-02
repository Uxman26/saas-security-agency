from typing import List, Optional
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module
from app.schemas import SmsConfigResponse, SmsConfigUpdate, SmsSendRequest, SmsLogResponse
from app.services import sms_service

router = APIRouter(prefix="/sms", tags=["sms"])


@router.get("/config", response_model=SmsConfigResponse)
def get_config(db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("sms", "view"))):
    return SmsConfigResponse(**sms_service.get_sms_config(db, current_user.id))


@router.patch("/config", response_model=SmsConfigResponse)
def patch_config(body: SmsConfigUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("sms", "edit"))):
    return SmsConfigResponse(**sms_service.update_sms_config(db, current_user.id, body.model_dump(exclude_unset=True)))


@router.post("/send", response_model=SmsLogResponse)
def send_sms(body: SmsSendRequest, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("sms", "send"))):
    log = sms_service.send_sms(db, current_user.id, body.recipient, body.body, body.template_key)
    return SmsLogResponse.model_validate(log)


@router.get("/logs", response_model=List[SmsLogResponse])
def sms_logs(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("sms", "logs_view")),
):
    rows = sms_service.list_sms_logs(db, current_user.id, start_date=start_date, end_date=end_date)
    return [SmsLogResponse.model_validate(r) for r in rows]
