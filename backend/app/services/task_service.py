"""Staff to-do list — jobs assigned to an employee, with a due date and optional site."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import Guard, Site, Task, User
from app.schemas import TaskCounts, TaskCreate, TaskResponse, TaskUpdate
from app.services.company_service import get_company_by_user_id
from app.services.portal_access import (
    filter_sites_for_user,
    get_linked_guard,
    is_client_portal_user,
    is_portal_role,
    is_staff_portal_user,
)

PRIORITIES = ("low", "normal", "high", "urgent")
STATUSES = ("todo", "in_progress", "done", "cancelled")
OPEN_STATUSES = ("todo", "in_progress")


def _out(row: Task) -> TaskResponse:
    data = TaskResponse.model_validate(row)
    overdue = bool(
        row.due_date and row.status in OPEN_STATUSES and row.due_date < date.today()
    )
    return data.model_copy(
        update={
            "guard_name": row.guard.full_name if row.guard else None,
            "site_name": row.site.name if row.site else None,
            "created_by_name": row.created_by.full_name if row.created_by else None,
            "completed_by_name": row.completed_by.full_name if row.completed_by else None,
            "is_overdue": overdue,
        }
    )


def _scope(db: Session, user: User, q):
    """What this login may see.

    Staff see only what is assigned to them — a to-do list is personal, and showing a
    guard the whole company's jobs would be the same leak the rota had. Clients see
    tasks at their own sites, which is the scope every other client-facing module uses.
    """
    if is_staff_portal_user(user):
        guard = get_linked_guard(db, user)
        if not guard:
            return q.filter(Task.id < 0)
        return q.filter(Task.guard_id == guard.id)
    if is_client_portal_user(user):
        allowed = {
            r[0]
            for r in filter_sites_for_user(
                db, user, db.query(Site.id).filter(Site.company_id == user.company_id)
            ).all()
        }
        return q.filter(Task.site_id.in_(allowed or {0}))
    return q


def _validate(db: Session, company_id: int, guard_id: Optional[int], site_id: Optional[int]) -> None:
    if guard_id is not None:
        if not db.query(Guard.id).filter(Guard.id == guard_id, Guard.company_id == company_id).first():
            raise HTTPException(status_code=404, detail="Employee not found")
    if site_id is not None:
        if not db.query(Site.id).filter(Site.id == site_id, Site.company_id == company_id).first():
            raise HTTPException(status_code=404, detail="Site not found")


def _base(db: Session, company_id: int):
    return (
        db.query(Task)
        .options(
            joinedload(Task.guard),
            joinedload(Task.site),
            joinedload(Task.created_by),
            joinedload(Task.completed_by),
        )
        .filter(Task.company_id == company_id)
    )


def create_task(db: Session, user: User, data: TaskCreate) -> TaskResponse:
    company = get_company_by_user_id(db, user.id)
    if is_portal_role(user):
        # Portal logins receive work, they do not hand it out.
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if data.priority not in PRIORITIES:
        raise HTTPException(status_code=422, detail=f"priority must be one of {', '.join(PRIORITIES)}")
    _validate(db, company.id, data.guard_id, data.site_id)
    row = Task(
        company_id=company.id,
        created_by_user_id=user.id,
        status="todo",
        **data.model_dump(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return get_task(db, user, row.id)


def list_tasks(
    db: Session,
    user: User,
    status: Optional[str] = None,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    due_before: Optional[date] = None,
    overdue_only: bool = False,
) -> list[TaskResponse]:
    company = get_company_by_user_id(db, user.id)
    q = _scope(db, user, _base(db, company.id))
    if status:
        q = q.filter(Task.status == status)
    if guard_id:
        q = q.filter(Task.guard_id == guard_id)
    if site_id:
        q = q.filter(Task.site_id == site_id)
    if due_before:
        q = q.filter(Task.due_date <= due_before)
    if overdue_only:
        q = q.filter(Task.due_date < date.today(), Task.status.in_(OPEN_STATUSES))
    rows = q.order_by(Task.due_date.is_(None), Task.due_date, Task.id.desc()).limit(500).all()
    return [_out(r) for r in rows]


def counts(db: Session, user: User) -> TaskCounts:
    company = get_company_by_user_id(db, user.id)
    rows = _scope(db, user, db.query(Task).filter(Task.company_id == company.id)).all()
    today = date.today()
    out = TaskCounts()
    for r in rows:
        out.total += 1
        if r.status in ("todo", "in_progress", "done", "cancelled"):
            setattr(out, r.status, getattr(out, r.status) + 1)
        if r.due_date and r.status in OPEN_STATUSES and r.due_date < today:
            out.overdue += 1
    return out


def get_task(db: Session, user: User, task_id: int) -> TaskResponse:
    company = get_company_by_user_id(db, user.id)
    row = _scope(db, user, _base(db, company.id).filter(Task.id == task_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return _out(row)


def _row_for_write(db: Session, user: User, company_id: int, task_id: int) -> Task:
    q = db.query(Task).filter(Task.id == task_id, Task.company_id == company_id)
    row = _scope(db, user, q).first()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


def update_task(db: Session, user: User, task_id: int, data: TaskUpdate) -> TaskResponse:
    company = get_company_by_user_id(db, user.id)
    row = _row_for_write(db, user, company.id, task_id)
    payload = data.model_dump(exclude_unset=True)

    if is_portal_role(user):
        # The assignee may move their own task along; they may not re-assign it,
        # re-scope it or rewrite what was asked of them.
        allowed = {"status"}
        if set(payload) - allowed:
            raise HTTPException(status_code=403, detail="You can only change the status of your tasks")
    if "priority" in payload and payload["priority"] not in PRIORITIES:
        raise HTTPException(status_code=422, detail=f"priority must be one of {', '.join(PRIORITIES)}")
    if "status" in payload and payload["status"] not in STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {', '.join(STATUSES)}")
    _validate(db, company.id, payload.get("guard_id"), payload.get("site_id"))

    if "status" in payload:
        _apply_status(row, payload.pop("status"), user)
    for key, value in payload.items():
        setattr(row, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    return get_task(db, user, task_id)


def _apply_status(row: Task, status: str, user: User) -> None:
    row.status = status
    if status == "done":
        row.completed_at = datetime.now(timezone.utc)
        row.completed_by_user_id = user.id
    else:
        # Reopening clears the completion stamp so it can never describe a live task.
        row.completed_at = None
        row.completed_by_user_id = None


def complete_task(db: Session, user: User, task_id: int, done: bool = True) -> TaskResponse:
    """Tick a task off. Separate from edit so an assignee can finish work without
    holding the permission to rewrite or reassign tasks."""
    company = get_company_by_user_id(db, user.id)
    row = _row_for_write(db, user, company.id, task_id)
    _apply_status(row, "done" if done else "todo", user)
    db.commit()
    return get_task(db, user, task_id)


def delete_task(db: Session, user: User, task_id: int) -> None:
    company = get_company_by_user_id(db, user.id)
    if is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    row = _row_for_write(db, user, company.id, task_id)
    db.delete(row)
    db.commit()
