from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
import json
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_module
from app.schemas import PlannerExportRequest, RotaPlanCopy, RotaPlanCreate, RotaPlanDetail, RotaPlanListItem, RotaPlanPublishResult, RotaPlanUpdate
from app.services import rota_export, rota_plan_service

router = APIRouter(prefix="/rotas", tags=["rotas"])


@router.post("/export")
def export_planner_rota(
    body: PlannerExportRequest,
    current_user: User = Depends(require_module("rota", "export")),
):
    fmt = (body.format or "pdf").lower()
    if fmt != "pdf":
        raise HTTPException(status_code=400, detail="Only pdf format is supported")
    try:
        data = json.loads(body.planner_data)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid planner data") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Invalid planner data")
    pdf = rota_export.export_planner_rota_pdf(data)
    safe = str(data.get("rotaName") or "rota").strip().replace(" ", "_")
    safe = "".join(c for c in safe if c.isalnum() or c in "._-")[:40] or "rota"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe}.pdf"'},
    )


@router.get("", response_model=list[RotaPlanListItem])
def list_rotas(db: Session = Depends(get_db), current_user: User = Depends(require_module("rota", "view"))):
    return rota_plan_service.list_rota_plans(db, current_user.id)


@router.post("", response_model=RotaPlanDetail, status_code=status.HTTP_201_CREATED)
def create_rota(
    body: RotaPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("rota", "create")),
):
    return rota_plan_service.create_rota_plan(db, current_user.id, body)


@router.post("/{plan_id}/copy", response_model=RotaPlanDetail, status_code=status.HTTP_201_CREATED)
def copy_rota(
    plan_id: int,
    body: RotaPlanCopy,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("rota", "copy_plan")),
):
    return rota_plan_service.copy_rota_plan(db, current_user.id, plan_id, body)


@router.get("/{plan_id}", response_model=RotaPlanDetail)
def get_rota(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("rota", "view")),
):
    return rota_plan_service.get_rota_plan(db, current_user.id, plan_id)


@router.patch("/{plan_id}", response_model=RotaPlanDetail)
def update_rota(
    plan_id: int,
    body: RotaPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("rota", "edit")),
):
    return rota_plan_service.update_rota_plan(db, current_user.id, plan_id, body)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rota(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("rota", "delete")),
):
    rota_plan_service.delete_rota_plan(db, current_user.id, plan_id)


@router.post("/{plan_id}/publish", response_model=RotaPlanPublishResult)
def publish_rota(
    plan_id: int,
    guard_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("rota", "publish")),
):
    return rota_plan_service.publish_rota_plan(db, current_user.id, plan_id, guard_id)


@router.post("/{plan_id}/unpublish", response_model=RotaPlanPublishResult)
def unpublish_rota(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("rota", "unpublish")),
):
    return rota_plan_service.unpublish_rota_plan(db, current_user.id, plan_id)


@router.post("/{plan_id}/unpublish/{guard_id}", response_model=RotaPlanPublishResult)
def unpublish_rota_guard(
    plan_id: int,
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("rota", "unpublish_guard")),
):
    return rota_plan_service.unpublish_rota_plan_guard(db, current_user.id, plan_id, guard_id)
