"""The company's job title pick-list, offered by the staff forms.

Guard.job_title is a plain string, so this list is a convenience rather than a
constraint: renaming a title carries the staff records with it, and deleting one leaves
those records alone.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Guard, JobTitle
from app.schemas import JobTitleCreate, JobTitleResponse, JobTitleUpdate
from app.services import audit_service
from app.services.company_service import get_company_by_user_id

# What a company starts with, matching the list the staff form used to hard-code.
DEFAULT_JOB_TITLES: tuple[str, ...] = (
    "Guard",
    "Door Supervisor",
    "Cleaner",
    "Room Attendant",
    "Dog handler (K9)",
    "Porter",
)


def _staff_counts(db: Session, company_id: int) -> dict[str, int]:
    rows = (
        db.query(Guard.job_title, func.count(Guard.id))
        .filter(Guard.company_id == company_id, Guard.job_title.isnot(None), Guard.job_title != "")
        .group_by(Guard.job_title)
        .all()
    )
    return {(title or "").strip().lower(): count for title, count in rows}


def _to_read(row: JobTitle, counts: dict[str, int]) -> JobTitleResponse:
    return JobTitleResponse(
        id=row.id,
        company_id=row.company_id,
        name=row.name,
        staff_count=counts.get(row.name.strip().lower(), 0),
        created_at=row.created_at,
    )


def _seed_if_empty(db: Session, company_id: int) -> None:
    """First read for a company fills the list.

    Before this table existed the options were hard-coded and anything extra lived in one
    browser's local storage, so the titles already typed onto staff records are seeded
    alongside the defaults — otherwise a company would open the screen and find its own
    titles missing.
    """
    if db.query(JobTitle).filter(JobTitle.company_id == company_id).first():
        return
    names: list[str] = list(DEFAULT_JOB_TITLES)
    seen = {n.strip().lower() for n in names}
    in_use = (
        db.query(Guard.job_title)
        .filter(Guard.company_id == company_id, Guard.job_title.isnot(None), Guard.job_title != "")
        .distinct()
        .all()
    )
    for (title,) in in_use:
        t = (title or "").strip()
        if t and t.lower() not in seen:
            names.append(t)
            seen.add(t.lower())
    for name in names:
        db.add(JobTitle(company_id=company_id, name=name))
    db.commit()


def list_job_titles(db: Session, user_id: int) -> List[JobTitleResponse]:
    company = get_company_by_user_id(db, user_id)
    _seed_if_empty(db, company.id)
    counts = _staff_counts(db, company.id)
    rows = (
        db.query(JobTitle)
        .filter(JobTitle.company_id == company.id)
        .order_by(func.lower(JobTitle.name))
        .all()
    )
    return [_to_read(r, counts) for r in rows]


def _find_duplicate(db: Session, company_id: int, name: str, exclude_id: Optional[int] = None) -> bool:
    q = db.query(JobTitle).filter(
        JobTitle.company_id == company_id,
        func.lower(JobTitle.name) == name.strip().lower(),
    )
    if exclude_id is not None:
        q = q.filter(JobTitle.id != exclude_id)
    return q.first() is not None


def create_job_title(db: Session, data: JobTitleCreate, user_id: int) -> JobTitleResponse:
    company = get_company_by_user_id(db, user_id)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Job title cannot be empty")
    if _find_duplicate(db, company.id, name):
        raise HTTPException(status_code=409, detail="That job title already exists.")
    row = JobTitle(company_id=company.id, name=name)
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That job title already exists.")
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="job_title_created",
        entity_type="job_title",
        meta={"name": name},
    )
    db.commit()
    db.refresh(row)
    return _to_read(row, _staff_counts(db, company.id))


def get_job_title(db: Session, job_title_id: int, user_id: int) -> JobTitleResponse:
    company = get_company_by_user_id(db, user_id)
    row = (
        db.query(JobTitle)
        .filter(JobTitle.id == job_title_id, JobTitle.company_id == company.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job title not found")
    return _to_read(row, _staff_counts(db, company.id))


def update_job_title(db: Session, job_title_id: int, data: JobTitleUpdate, user_id: int) -> JobTitleResponse:
    company = get_company_by_user_id(db, user_id)
    row = (
        db.query(JobTitle)
        .filter(JobTitle.id == job_title_id, JobTitle.company_id == company.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job title not found")
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Job title cannot be empty")
    if _find_duplicate(db, company.id, name, exclude_id=row.id):
        raise HTTPException(status_code=409, detail="That job title already exists.")
    old = row.name
    row.name = name
    # Staff carry the old wording as free text; a rename that left them behind would
    # silently split one job title into two.
    moved = 0
    if old != name:
        moved = (
            db.query(Guard)
            .filter(Guard.company_id == company.id, Guard.job_title == old)
            .update({Guard.job_title: name}, synchronize_session=False)
        )
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="job_title_updated",
        entity_type="job_title",
        meta={"from": old, "to": name, "staff_updated": moved},
    )
    db.commit()
    db.refresh(row)
    return _to_read(row, _staff_counts(db, company.id))


def delete_job_title(db: Session, job_title_id: int, user_id: int) -> None:
    """Removes it from the pick-list only. Staff already on it keep the title."""
    company = get_company_by_user_id(db, user_id)
    row = (
        db.query(JobTitle)
        .filter(JobTitle.id == job_title_id, JobTitle.company_id == company.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job title not found")
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="job_title_deleted",
        entity_type="job_title",
        meta={"name": row.name},
    )
    db.delete(row)
    db.commit()
