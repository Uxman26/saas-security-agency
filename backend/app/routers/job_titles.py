from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module
from app.schemas import JobTitleCreate, JobTitleResponse, JobTitleUpdate
from app.services import job_title_service

router = APIRouter(prefix="/job-titles", tags=["job-titles"])


@router.get("", response_model=List[JobTitleResponse])
def list_job_titles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "job_titles_view")),
):
    """The company's job title pick-list, with how many staff hold each one."""
    return job_title_service.list_job_titles(db, current_user.id)


@router.post("", response_model=JobTitleResponse, status_code=status.HTTP_201_CREATED)
def create_job_title(
    data: JobTitleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "job_titles_create")),
):
    return job_title_service.create_job_title(db, data, current_user.id)


@router.get("/{job_title_id}", response_model=JobTitleResponse)
def get_job_title(
    job_title_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "job_titles_view")),
):
    return job_title_service.get_job_title(db, job_title_id, current_user.id)


@router.put("/{job_title_id}", response_model=JobTitleResponse)
def update_job_title(
    job_title_id: int,
    data: JobTitleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "job_titles_edit")),
):
    """Renames the title and moves every staff record that carries it."""
    return job_title_service.update_job_title(db, job_title_id, data, current_user.id)


@router.delete("/{job_title_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job_title(
    job_title_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "job_titles_delete")),
):
    job_title_service.delete_job_title(db, job_title_id, current_user.id)
    return None
