from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import PERM_ASSIGN_DELETE, PERM_ASSIGN_READ, PERM_ASSIGN_WRITE, require_perm
from app.schemas import RotaPlanCopy, RotaPlanCreate, RotaPlanDetail, RotaPlanListItem, RotaPlanPublishResult, RotaPlanUpdate
from app.services import rota_plan_service

router = APIRouter(prefix="/rotas", tags=["rotas"])


@router.get("", response_model=list[RotaPlanListItem])
def list_rotas(db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_ASSIGN_READ))):
    return rota_plan_service.list_rota_plans(db, current_user.id)


@router.post("", response_model=RotaPlanDetail, status_code=status.HTTP_201_CREATED)
def create_rota(
    body: RotaPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE)),
):
    return rota_plan_service.create_rota_plan(db, current_user.id, body)


@router.post("/{plan_id}/copy", response_model=RotaPlanDetail, status_code=status.HTTP_201_CREATED)
def copy_rota(
    plan_id: int,
    body: RotaPlanCopy,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE)),
):
    return rota_plan_service.copy_rota_plan(db, current_user.id, plan_id, body)


@router.get("/{plan_id}", response_model=RotaPlanDetail)
def get_rota(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_READ)),
):
    return rota_plan_service.get_rota_plan(db, current_user.id, plan_id)


@router.patch("/{plan_id}", response_model=RotaPlanDetail)
def update_rota(
    plan_id: int,
    body: RotaPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE)),
):
    return rota_plan_service.update_rota_plan(db, current_user.id, plan_id, body)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rota(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_DELETE)),
):
    rota_plan_service.delete_rota_plan(db, current_user.id, plan_id)


@router.post("/{plan_id}/publish", response_model=RotaPlanPublishResult)
def publish_rota(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_ASSIGN_WRITE)),
):
    return rota_plan_service.publish_rota_plan(db, current_user.id, plan_id)
