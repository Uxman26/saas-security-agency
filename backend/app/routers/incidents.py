from datetime import date
from typing import List, Optional
import os
import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_module
from app.schemas import IncidentCreate, IncidentResponse, IncidentSummaryRow, IncidentUpdate
from app.services import incident_service
from app.services.image_avif_service import is_image_filename, save_upload_as_avif
from app.storage_paths import INCIDENT_PHOTOS_DIR, ensure_upload_dirs

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("", response_model=list[IncidentResponse])
def list_incidents(
    status: Optional[str] = None,
    site_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("incidents", "view")),
):
    return incident_service.list_incidents(
        db, current_user, status=status, site_id=site_id, start_date=start_date, end_date=end_date
    )


@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
def create_incident(
    body: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("incidents", "create")),
):
    return incident_service.create_incident(db, current_user, body)


@router.post("/with-images", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident_with_images(
    notes: str = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    accuracy: Optional[float] = Form(None),
    occurred_at: Optional[str] = Form(None),
    site_id: Optional[int] = Form(None),
    client_id: Optional[int] = Form(None),
    assignment_id: Optional[int] = Form(None),
    guard_id: Optional[int] = Form(None),
    images: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("incidents", "edit")),
):
    from datetime import datetime

    occurred = None
    if occurred_at:
        try:
            occurred = datetime.fromisoformat(occurred_at.replace("Z", "+00:00"))
        except ValueError:
            occurred = None
    attachments: list[tuple[str, Optional[str]]] = []
    ensure_upload_dirs()
    for img in images or []:
        if not img.filename or not is_image_filename(img.filename):
            continue
        base = os.path.join(INCIDENT_PHOTOS_DIR, f"{uuid.uuid4().hex}")
        dest, mime = save_upload_as_avif(img.file, base)
        attachments.append((dest, mime))
    body = IncidentCreate(
        notes=notes,
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
        occurred_at=occurred,
        site_id=site_id,
        client_id=client_id,
        assignment_id=assignment_id,
        guard_id=guard_id,
    )
    return incident_service.create_incident(db, current_user, body, attachment_paths=attachments)


@router.get("/reports/summary", response_model=list[IncidentSummaryRow])
def summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("incidents", "view")),
):
    return incident_service.summary_report(db, current_user, start_date, end_date)


@router.get("/{incident_id}/attachments/{attachment_id}/file")
def download_attachment(
    incident_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("incidents", "view")),
):
    """Serve an incident photo behind the same permission check as the incident itself."""
    path, mime = incident_service.attachment_file(db, current_user, incident_id, attachment_id)
    return FileResponse(path, media_type=mime)


@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("incidents", "view")),
):
    return incident_service.get_incident(db, current_user, incident_id)


@router.patch("/{incident_id}", response_model=IncidentResponse)
def patch_incident(
    incident_id: int,
    body: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("incidents", "edit")),
):
    return incident_service.update_incident(db, current_user, incident_id, body)
