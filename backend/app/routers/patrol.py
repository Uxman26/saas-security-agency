from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_module
from app.schemas import (
    PatrolCheckpointCreate,
    PatrolCheckpointResponse,
    PatrolCheckpointUpdate,
    PatrolComplianceRow,
    PatrolLogResponse,
    PatrolRouteCreate,
    PatrolRouteResponse,
    PatrolRouteUpdate,
    PatrolScanRequest,
    PatrolSessionResponse,
    PatrolSessionStart,
    PatrolTodayResponse,
)
from app.services import patrol_service
from app.storage_paths import PATROL_PHOTOS_DIR, ensure_upload_dirs
from app.services.image_avif_service import is_image_filename, save_upload_as_avif
import os
import uuid

router = APIRouter(prefix="/patrol", tags=["patrol"])


@router.get("/routes", response_model=list[PatrolRouteResponse])
def list_routes(
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "view")),
):
    return patrol_service.list_routes(db, current_user, site_id)


@router.post("/routes", response_model=PatrolRouteResponse, status_code=status.HTTP_201_CREATED)
def create_route(
    body: PatrolRouteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "edit")),
):
    return patrol_service.create_route(db, current_user, body)


@router.get("/routes/{route_id}", response_model=PatrolRouteResponse)
def get_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "view")),
):
    return patrol_service.get_route(db, current_user, route_id)


@router.patch("/routes/{route_id}", response_model=PatrolRouteResponse)
def patch_route(
    route_id: int,
    body: PatrolRouteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "edit")),
):
    return patrol_service.update_route(db, current_user, route_id, body)


@router.delete("/routes/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "edit")),
):
    patrol_service.delete_route(db, current_user, route_id)
    return None


@router.post("/checkpoints", response_model=PatrolCheckpointResponse, status_code=status.HTTP_201_CREATED)
def create_checkpoint(
    body: PatrolCheckpointCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "edit")),
):
    return patrol_service.create_checkpoint(db, current_user, body)


@router.patch("/checkpoints/{checkpoint_id}", response_model=PatrolCheckpointResponse)
def patch_checkpoint(
    checkpoint_id: int,
    body: PatrolCheckpointUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "edit")),
):
    return patrol_service.update_checkpoint(db, current_user, checkpoint_id, body)


@router.delete("/checkpoints/{checkpoint_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_checkpoint(
    checkpoint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "edit")),
):
    patrol_service.delete_checkpoint(db, current_user, checkpoint_id)
    return None


@router.get("/checkpoints/{checkpoint_id}/qr.png")
def checkpoint_qr_png(
    checkpoint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "view")),
):
    cp = patrol_service.get_checkpoint(db, current_user, checkpoint_id)
    data = patrol_service.checkpoint_qr_png_bytes(cp)
    return Response(content=data, media_type="image/png", headers={"Content-Disposition": f'inline; filename="{cp.code}.png"'})


@router.get("/checkpoints/{checkpoint_id}/qr.pdf")
def checkpoint_qr_pdf(
    checkpoint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "view")),
):
    cp = patrol_service.get_checkpoint(db, current_user, checkpoint_id)
    data = patrol_service.checkpoint_qr_pdf_bytes(cp)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{cp.code}-sticker.pdf"'},
    )


@router.post("/sessions/start", response_model=PatrolSessionResponse, status_code=status.HTTP_201_CREATED)
def start_session(
    body: PatrolSessionStart,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "edit")),
):
    return patrol_service.start_session(db, current_user, body)


@router.post("/checkpoint-scan", response_model=PatrolLogResponse)
def checkpoint_scan(
    body: PatrolScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "edit")),
):
    return patrol_service.scan_checkpoint(db, current_user, body)


@router.post("/checkpoint-scan-photo", response_model=PatrolLogResponse)
async def checkpoint_scan_with_photo(
    qr_token: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    accuracy: Optional[float] = Form(None),
    device_id: Optional[str] = Form(None),
    session_id: Optional[int] = Form(None),
    assignment_id: Optional[int] = Form(None),
    guard_id: Optional[int] = Form(None),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "edit")),
):
    photo_path = None
    if photo and photo.filename and is_image_filename(photo.filename):
        ensure_upload_dirs()
        base = os.path.join(PATROL_PHOTOS_DIR, f"{uuid.uuid4().hex}")
        dest, _mime = save_upload_as_avif(photo.file, base)
        photo_path = dest
    body = PatrolScanRequest(
        qr_token=qr_token,
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
        device_id=device_id,
        session_id=session_id,
        assignment_id=assignment_id,
        guard_id=guard_id,
    )
    return patrol_service.scan_checkpoint(db, current_user, body, photo_path=photo_path)


@router.get("/logs", response_model=list[PatrolLogResponse])
def logs(
    site_id: Optional[int] = None,
    route_id: Optional[int] = None,
    guard_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "view")),
):
    return patrol_service.list_logs(
        db, current_user, site_id=site_id, route_id=route_id, guard_id=guard_id, start_date=start_date, end_date=end_date
    )


@router.get("/reports/compliance", response_model=list[PatrolComplianceRow])
def compliance(
    start_date: date,
    end_date: date,
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "view")),
):
    return patrol_service.compliance_report(db, current_user, start_date, end_date, site_id)


@router.get("/reports/detail", response_model=list[PatrolLogResponse])
def detail(
    start_date: date,
    end_date: date,
    route_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "view")),
):
    return patrol_service.detail_report(db, current_user, start_date, end_date, route_id)


@router.get("/today", response_model=PatrolTodayResponse)
def today(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("patrol", "edit")),
):
    return patrol_service.today_for_guard(db, current_user)


@router.get("/check/{qr_token}")
def public_check_token(qr_token: str, db: Session = Depends(get_db)):
    """Token-only existence check — no PII."""
    from app.models import PatrolCheckpoint

    cp = db.query(PatrolCheckpoint).filter(PatrolCheckpoint.qr_token == qr_token, PatrolCheckpoint.status == "active").first()
    return {"valid": bool(cp)}
