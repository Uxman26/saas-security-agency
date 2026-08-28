from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_module
from app.schemas import TaskCounts, TaskCreate, TaskResponse, TaskUpdate
from app.services import task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=List[TaskResponse])
def list_tasks(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    due_before: Optional[date] = None,
    overdue_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("tasks", "view")),
):
    return task_service.list_tasks(
        db, current_user, status_filter, guard_id, site_id, due_before, overdue_only
    )


@router.get("/counts", response_model=TaskCounts)
def task_counts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("tasks", "view")),
):
    """Board counts. Above /{task_id} so the dynamic route does not swallow it."""
    return task_service.counts(db, current_user)


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    body: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("tasks", "create")),
):
    return task_service.create_task(db, current_user, body)


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("tasks", "view")),
):
    return task_service.get_task(db, current_user, task_id)


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    body: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("tasks", "edit")),
):
    return task_service.update_task(db, current_user, task_id, body)


@router.post("/{task_id}/complete", response_model=TaskResponse)
def complete_task(
    task_id: int,
    done: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("tasks", "complete")),
):
    """Tick a task off. Its own permission so an assignee can finish work without
    holding the right to rewrite or reassign tasks."""
    return task_service.complete_task(db, current_user, task_id, done)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("tasks", "delete")),
):
    task_service.delete_task(db, current_user, task_id)
    return None
