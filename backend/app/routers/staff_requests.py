from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_module
from app.schemas import StaffRequestBulkCreate, StaffRequestCreate, StaffRequestResponse, StaffRequestReview
from app.services import staff_request_service

router = APIRouter(prefix="/staff-requests", tags=["staff-requests"])


@router.get("", response_model=list[StaffRequestResponse])
def list_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("staff_requests", "view")),
):
    return staff_request_service.list_staff_requests(db, current_user, status)


@router.post("", response_model=StaffRequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(
    body: StaffRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("client_portal", "create")),
):
    return staff_request_service.create_staff_request(db, current_user, body)


@router.post("/bulk", response_model=list[StaffRequestResponse], status_code=status.HTTP_201_CREATED)
def create_requests_bulk(
    body: StaffRequestBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("client_portal", "bulk_create")),
):
    return staff_request_service.create_staff_requests_bulk(db, current_user, body)


@router.get("/{request_id}", response_model=StaffRequestResponse)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("staff_requests", "view")),
):
    return staff_request_service.get_staff_request(db, current_user, request_id)


@router.post("/{request_id}/approve", response_model=StaffRequestResponse)
def approve_request(
    request_id: int,
    body: StaffRequestReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("staff_requests", "approve")),
):
    return staff_request_service.approve_staff_request(db, current_user, request_id, body)


@router.post("/{request_id}/reject", response_model=StaffRequestResponse)
def reject_request(
    request_id: int,
    body: StaffRequestReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("staff_requests", "reject")),
):
    return staff_request_service.reject_staff_request(db, current_user, request_id, body)
