"""Teams: the grouping the Employee Hub's Teams View is built on.

A team is a flat named group of staff. Membership is many-to-many because people work
across more than one — a supervisor can sit in both Door Team and Cleaning — and the hub
lists everyone without a team under "No team" rather than hiding them.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Guard, Team, TeamMember
from app.services import audit_service
from app.services.company_service import get_company_by_user_id

# The bucket the hub shows for staff in no team at all. Not a row in the table: it exists
# only in the response, so nobody can rename or delete it.
NO_TEAM_ID = 0
NO_TEAM_NAME = "No team"


def _team(db: Session, team_id: int, company_id: int) -> Team:
    row = db.query(Team).filter(Team.id == team_id, Team.company_id == company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Team not found")
    return row


def _live_guard_ids(db: Session, company_id: int) -> set[int]:
    """Archived staff are not counted in a team; they are out of the hub entirely."""
    return {
        r[0]
        for r in db.query(Guard.id)
        .filter(Guard.company_id == company_id, Guard.deleted_at.is_(None))
        .all()
    }


def list_teams(db: Session, user_id: int) -> List[dict]:
    company = get_company_by_user_id(db, user_id)
    live = _live_guard_ids(db, company.id)
    rows = (
        db.query(Team)
        .filter(Team.company_id == company.id)
        .order_by(func.lower(Team.name))
        .all()
    )
    members = db.query(TeamMember).filter(TeamMember.company_id == company.id).all()
    by_team: dict[int, list[int]] = {}
    for m in members:
        if m.guard_id in live:
            by_team.setdefault(m.team_id, []).append(m.guard_id)
    return [
        {
            "id": t.id,
            "company_id": t.company_id,
            "name": t.name,
            "description": t.description,
            "member_count": len(by_team.get(t.id, [])),
            "member_ids": sorted(by_team.get(t.id, [])),
            "created_at": t.created_at,
        }
        for t in rows
    ]


def create_team(db: Session, user_id: int, name: str, description: Optional[str] = None) -> dict:
    company = get_company_by_user_id(db, user_id)
    clean = (name or "").strip()
    if not clean:
        raise HTTPException(status_code=422, detail="Team name cannot be empty")
    exists = (
        db.query(Team)
        .filter(Team.company_id == company.id, func.lower(Team.name) == clean.lower())
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="A team with that name already exists.")
    row = Team(company_id=company.id, name=clean, description=(description or "").strip() or None)
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A team with that name already exists.")
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="team_created",
        entity_type="team",
        entity_id=row.id,
        meta={"name": clean},
    )
    db.commit()
    db.refresh(row)
    return list_one(db, user_id, row.id)


def list_one(db: Session, user_id: int, team_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    _team(db, team_id, company.id)
    for t in list_teams(db, user_id):
        if t["id"] == team_id:
            return t
    raise HTTPException(status_code=404, detail="Team not found")


def update_team(
    db: Session, user_id: int, team_id: int, name: Optional[str], description: Optional[str]
) -> dict:
    company = get_company_by_user_id(db, user_id)
    row = _team(db, team_id, company.id)
    if name is not None:
        clean = name.strip()
        if not clean:
            raise HTTPException(status_code=422, detail="Team name cannot be empty")
        clash = (
            db.query(Team)
            .filter(
                Team.company_id == company.id,
                func.lower(Team.name) == clean.lower(),
                Team.id != team_id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="A team with that name already exists.")
        row.name = clean
    if description is not None:
        row.description = description.strip() or None
    db.commit()
    return list_one(db, user_id, team_id)


def delete_team(db: Session, user_id: int, team_id: int) -> None:
    """Removes the team. Its members are not touched — they fall back to "No team"."""
    company = get_company_by_user_id(db, user_id)
    row = _team(db, team_id, company.id)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="team_deleted",
        entity_type="team",
        entity_id=team_id,
        meta={"name": row.name},
    )
    db.delete(row)
    db.commit()


def set_team_members(db: Session, user_id: int, team_id: int, guard_ids: List[int]) -> dict:
    """Replaces the team's membership wholesale — what the Manage teams screen sends."""
    company = get_company_by_user_id(db, user_id)
    _team(db, team_id, company.id)
    wanted = {
        r[0]
        for r in db.query(Guard.id)
        .filter(Guard.company_id == company.id, Guard.id.in_(tuple(set(guard_ids)) or (0,)))
        .all()
    }
    db.query(TeamMember).filter(
        TeamMember.company_id == company.id, TeamMember.team_id == team_id
    ).delete(synchronize_session=False)
    for gid in sorted(wanted):
        db.add(TeamMember(company_id=company.id, team_id=team_id, guard_id=gid))
    db.commit()
    return list_one(db, user_id, team_id)


def set_guard_teams(db: Session, user_id: int, guard_id: int, team_ids: List[int]) -> List[int]:
    """Replaces which teams one person belongs to — what the Employment tab sends."""
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    valid = {
        r[0]
        for r in db.query(Team.id)
        .filter(Team.company_id == company.id, Team.id.in_(tuple(set(team_ids)) or (0,)))
        .all()
    }
    db.query(TeamMember).filter(
        TeamMember.company_id == company.id, TeamMember.guard_id == guard_id
    ).delete(synchronize_session=False)
    for tid in sorted(valid):
        db.add(TeamMember(company_id=company.id, team_id=tid, guard_id=guard_id))
    db.commit()
    return sorted(valid)


def teams_by_guard(db: Session, company_id: int) -> dict[int, list[dict]]:
    """guard id → the teams they are in, for the hub and the list view's Team(s) column."""
    rows = (
        db.query(TeamMember.guard_id, Team.id, Team.name)
        .join(Team, Team.id == TeamMember.team_id)
        .filter(TeamMember.company_id == company_id)
        .order_by(func.lower(Team.name))
        .all()
    )
    out: dict[int, list[dict]] = {}
    for guard_id, team_id, name in rows:
        out.setdefault(guard_id, []).append({"id": team_id, "name": name})
    return out
