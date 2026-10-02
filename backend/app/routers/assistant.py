from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.services import assistant_service

router = APIRouter(prefix="/assistant", tags=["assistant"])


class AssistantChatRequest(BaseModel):
    message: str = Field(default="", max_length=2000)
    path: Optional[str] = Field(default=None, max_length=200)
    confirm_proposal: Optional[dict[str, Any]] = None


class AssistantChatResponse(BaseModel):
    reply: str
    sources: list[dict[str, Any]] = []
    navigation: list[dict[str, Any]] = []
    proposal: Optional[dict[str, Any]] = None
    actions: list[dict[str, Any]] = []
    mode: str = "retrieval"


@router.post("/chat", response_model=AssistantChatResponse)
def assistant_chat(
    body: AssistantChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Authenticated ControlOps assistant — RBAC/tenant scoped, no DB bypass."""
    out = assistant_service.chat(
        db,
        current_user,
        body.message,
        path=body.path,
        confirm_proposal=body.confirm_proposal,
    )
    return AssistantChatResponse(**out)
