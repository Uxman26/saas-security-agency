from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services.platform_rbac_service import require_platform_perm
from app.services import live_support_service as svc

router = APIRouter(prefix="/live-support", tags=["live-support"])
admin_router = APIRouter(prefix="/admin/live-support", tags=["admin-live-support"])


class DayHours(BaseModel):
    enabled: bool = True
    start: str = "09:00"
    end: str = "17:30"

    @field_validator("start", "end")
    @classmethod
    def hhmm(cls, v: str) -> str:
        value = (v or "").strip()
        if not svc.HHMM.match(value):
            raise ValueError("Time must be HH:MM")
        return value


class VisitorStart(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    company_name: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=80)
    initial_message: Optional[str] = Field(default=None, max_length=4000)

    @field_validator("full_name", "company_name", "city")
    @classmethod
    def strip_required(cls, v: str) -> str:
        value = (v or "").strip()
        if len(value) < 2:
            raise ValueError("This field is required")
        return value


class VisitorMessage(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    visitor_token: Optional[str] = Field(default=None, max_length=200)


class AgentMessage(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class AvailabilityUpdate(BaseModel):
    enabled: Optional[bool] = None
    timezone: Optional[str] = None
    days: Optional[dict[str, DayHours]] = None
    working_days: Optional[list[int]] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    offline_message: Optional[str] = Field(default=None, max_length=500)
    no_agent_message: Optional[str] = Field(default=None, max_length=500)
    contact_email: Optional[str] = None


class AgentUpsert(BaseModel):
    user_id: int
    display_name: str = Field(min_length=1, max_length=100)
    is_available: bool = True


class AgentAvailabilityPatch(BaseModel):
    is_available: bool


@router.get("/status")
def public_status(db: Session = Depends(get_db)):
    return svc.availability_status(db)


@router.post("/conversations")
def start_chat(body: VisitorStart, db: Session = Depends(get_db)):
    return svc.start_conversation(
        db,
        full_name=body.full_name,
        email=str(body.email),
        company_name=body.company_name,
        city=body.city,
        initial_message=body.initial_message,
    )


@router.get("/conversations/{public_id}")
def get_chat(
    public_id: str,
    token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    return svc.get_conversation(db, public_id, visitor_token=token, include_token=False, require_token=True)


@router.post("/conversations/{public_id}/messages")
def visitor_message(public_id: str, body: VisitorMessage, db: Session = Depends(get_db)):
    return svc.post_visitor_message(db, public_id, body.body, visitor_token=body.visitor_token)


@admin_router.get("/status")
def admin_status(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("support.read", "support.write"))):
    return svc.availability_status(db)


@admin_router.get("/availability")
def get_availability(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("support.read", "support.write"))):
    return svc.get_availability(db)


@admin_router.patch("/availability")
def patch_availability(
    body: AvailabilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    payload = body.model_dump(exclude_unset=True)
    if "days" in payload and payload["days"] is not None:
        payload["days"] = {k: (v if isinstance(v, dict) else v.model_dump()) for k, v in payload["days"].items()}
    return svc.update_availability(db, payload, current_user)


@admin_router.get("/agents")
def agents(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("support.read", "support.write"))):
    return svc.list_agents(db)


@admin_router.post("/agents")
def upsert_agent(
    body: AgentUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    return svc.upsert_agent(db, body.user_id, body.display_name, body.is_available, current_user)


@admin_router.patch("/agents/{agent_id}")
def patch_agent(
    agent_id: int,
    body: AgentAvailabilityPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    return svc.set_agent_availability(db, agent_id, body.is_available, current_user)


@admin_router.get("/conversations")
def list_conversations(
    status: Optional[str] = Query(default="inbox"),
    q: Optional[str] = Query(default=None, max_length=120),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("support.read", "support.write")),
):
    if (status or "inbox") in ("inbox", "open_inbox"):
        return {"total": None, "items": svc.list_open_conversations(db)}
    return svc.list_conversations(db, status=status, q=q, limit=limit, offset=offset)


@admin_router.get("/reports")
def reports(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("support.read", "support.write"))):
    return svc.conversation_report(db)


@admin_router.get("/conversations/{conversation_id}")
def admin_get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("support.read", "support.write")),
):
    return svc.get_conversation_by_id(db, conversation_id)


@admin_router.post("/conversations/{conversation_id}/messages")
def agent_message(
    conversation_id: int,
    body: AgentMessage,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    return svc.post_agent_message(db, conversation_id, current_user, body.body)


@admin_router.post("/conversations/{conversation_id}/close")
def close_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    return svc.close_conversation(db, conversation_id, current_user)


@admin_router.post("/conversations/{conversation_id}/reopen")
def reopen_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    return svc.reopen_conversation(db, conversation_id, current_user)


@admin_router.post("/conversations/{conversation_id}/reassign")
def reassign(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    return svc.reassign_round_robin(db, conversation_id, current_user)
