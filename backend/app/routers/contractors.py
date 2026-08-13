from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_module
from app.contractor_schemas import (
    AssignmentCreate,
    AssignmentRead,
    ContractorCreate,
    ContractorListRead,
    ContractorRead,
    ContractorUpdate,
)
from app.services.company_service import get_company_by_user_id
from app.services import contractor_service

router = APIRouter(prefix="/contractors", tags=["contractors"])


@router.get("/assignments", response_model=list[AssignmentRead])
def list_assignments(
    main_contractor_id: Optional[UUID] = None,
    sub_contractor_id: Optional[UUID] = None,
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("contractors", "assignments_view")),
):
    company = get_company_by_user_id(db, current_user.id)
    return contractor_service.list_assignments(db, company.id, main_contractor_id, sub_contractor_id, site_id)


@router.post("/assignments", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED)
def create_assignment_route(
    body: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("contractors", "assign")),
):
    company = get_company_by_user_id(db, current_user.id)
    return contractor_service.create_assignment(db, company.id, body, current_user)


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment_route(
    assignment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("contractors", "unassign")),
):
    company = get_company_by_user_id(db, current_user.id)
    contractor_service.delete_assignment(db, company.id, assignment_id, current_user)
    return None


@router.get("", response_model=list[ContractorListRead])
def list_contractors_route(
    contractor_type: Optional[str] = Query(None, alias="type"),
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("contractors", "view")),
):
    company = get_company_by_user_id(db, current_user.id)
    tf = contractor_type if contractor_type in ("main", "sub") else None
    return contractor_service.list_contractors(db, company.id, tf, is_active)


@router.post("", response_model=ContractorRead, status_code=status.HTTP_201_CREATED)
def create_contractor_route(
    body: ContractorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("contractors", "create")),
):
    company = get_company_by_user_id(db, current_user.id)
    return contractor_service.create_contractor(db, company.id, body, current_user)


@router.get("/{contractor_id}", response_model=ContractorRead)
def get_contractor_route(
    contractor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("contractors", "view")),
):
    company = get_company_by_user_id(db, current_user.id)
    return contractor_service.get_contractor(db, company.id, contractor_id)


@router.patch("/{contractor_id}", response_model=ContractorRead)
def update_contractor_route(
    contractor_id: UUID,
    body: ContractorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("contractors", "edit")),
):
    company = get_company_by_user_id(db, current_user.id)
    return contractor_service.update_contractor(db, company.id, contractor_id, body, current_user)


@router.delete("/{contractor_id}/deactivate", response_model=ContractorRead)
def deactivate_contractor_route(
    contractor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("contractors", "deactivate")),
):
    company = get_company_by_user_id(db, current_user.id)
    return contractor_service.deactivate_contractor(db, company.id, contractor_id, current_user)
