from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module
from app.schemas import TeamCreate, TeamMembersUpdate, TeamResponse, TeamUpdate
from app.services import team_service

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=List[TeamResponse])
def list_teams(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "teams_view")),
):
    """The company's teams with their live membership counts."""
    return team_service.list_teams(db, current_user.id)


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
def create_team(
    body: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "teams_manage")),
):
    return team_service.create_team(db, current_user.id, body.name, body.description)


@router.get("/{team_id}", response_model=TeamResponse)
def get_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "teams_view")),
):
    return team_service.list_one(db, current_user.id, team_id)


@router.patch("/{team_id}", response_model=TeamResponse)
def update_team(
    team_id: int,
    body: TeamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "teams_manage")),
):
    return team_service.update_team(db, current_user.id, team_id, body.name, body.description)


@router.put("/{team_id}/members", response_model=TeamResponse)
def set_members(
    team_id: int,
    body: TeamMembersUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "teams_manage")),
):
    """Replaces the whole membership — what the Manage teams screen sends on save."""
    return team_service.set_team_members(db, current_user.id, team_id, body.guard_ids)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "teams_manage")),
):
    """Deletes the team only. Its members keep their records and fall back to "No team"."""
    team_service.delete_team(db, current_user.id, team_id)
    return None
