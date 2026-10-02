from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_platform_perm
from app.services import live_support_service as svc

router = APIRouter(prefix="/live-support", tags=["live-support"])
admin_router = APIRouter(prefix="/admin/live-support", tags=["admin-live-support"])


class VisitorStart(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    company_name: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=80)
    initial_message: Optional[str] = Field(default=None, max_length=4000)


class VisitorMessage(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class AgentMessage(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class AvailabilityUpdate(BaseModel):
    enabled: Optional[bool] = None
    timezone: Optional[str] = None
    working_days: Optional[list[int]] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    offline_message: Optional[str] = None
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
def get_chat(public_id: str, db: Session = Depends(get_db)):
    return svc.get_conversation(db, public_id)


@router.post("/conversations/{public_id}/messages")
def visitor_message(public_id: str, body: VisitorMessage, db: Session = Depends(get_db)):
    return svc.post_visitor_message(db, public_id, body.body)


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
    return svc.update_availability(db, body.model_dump(exclude_unset=True), current_user)


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
def open_conversations(db: Session = Depends(get_db), _: User = Depends(require_platform_perm("support.read", "support.write"))):
    return svc.list_open_conversations(db)


@admin_router.get("/conversations/{conversation_id}")
def admin_get_conversation(conversation_id: int, db: Session = Depends(get_db), _: User = Depends(require_platform_perm("support.read", "support.write"))):
    from app.models import LiveChatConversation

    conv = db.query(LiveChatConversation).filter(LiveChatConversation.id == conversation_id).first()
    if not conv:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Conversation not found")
    return svc.get_conversation(db, conv.public_id)


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


@admin_router.post("/conversations/{conversation_id}/reassign")
def reassign(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("support.write")),
):
    return svc.reassign_round_robin(db, conversation_id, current_user)
