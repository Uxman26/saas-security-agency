from fastapi import APIRouter, Depends, status, Query, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from app.database import get_db
from app.models import User
from app.schemas import GuardCreate, GuardResponse
from app.rbac import require_module
from app.services import guard_service
from app.storage_paths import GUARD_PHOTOS_DIR, ensure_upload_dirs, resolve_storage_path
from app.services.image_avif_service import AVIF_EXT, is_image_filename, save_upload_as_avif

router = APIRouter(prefix="/guards", tags=["guards"])

@router.post("", response_model=GuardResponse, status_code=status.HTTP_201_CREATED)
def create_guard(guard: GuardCreate, db: Session = Depends(get_db), current_user: User = Depends(require_module("guards", "create"))):
    return guard_service.create_guard(db, guard, current_user.id)

@router.get("", response_model=List[GuardResponse])
def get_guards(
    area: Optional[str] = Query(None),
    postcode: Optional[str] = Query(None),
    nearby: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("guards", "view")),
):
    return guard_service.get_guards(db, current_user.id, area=area, postcode=postcode, nearby=nearby)

@router.get("/{guard_id}", response_model=GuardResponse)
def get_guard(guard_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("guards", "view"))):
    return guard_service.get_guard_by_id(db, guard_id, current_user.id)

@router.put("/{guard_id}", response_model=GuardResponse)
def update_guard(guard_id: int, guard: GuardCreate, db: Session = Depends(get_db), current_user: User = Depends(require_module("guards", "edit"))):
    return guard_service.update_guard(db, guard_id, guard, current_user.id)

@router.post("/{guard_id}/photo", response_model=GuardResponse)
def upload_guard_photo(
    guard_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("guards", "edit")),
):
    guard = guard_service.get_guard_by_id(db, guard_id, current_user.id)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {AVIF_EXT, ".png", ".jpg", ".jpeg", ".webp", ".gif"} and not is_image_filename(file.filename):
        raise HTTPException(status_code=400, detail="Upload a valid image file")
    ensure_upload_dirs()
    base = os.path.join(GUARD_PHOTOS_DIR, f"guard_{guard.id}")
    old = resolve_storage_path(guard.photo_path)
    if old and os.path.isfile(old):
        try:
            os.remove(old)
        except OSError:
            pass
    dest, _mime = save_upload_as_avif(file.file, base)
    guard.photo_path = dest
    db.commit()
    db.refresh(guard)
    return guard

@router.get("/{guard_id}/photo")
def get_guard_photo(
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("guards", "view")),
):
    guard = guard_service.get_guard_by_id(db, guard_id, current_user.id)
    path = resolve_storage_path(guard.photo_path)
    if not path:
        raise HTTPException(status_code=404, detail="No photo")
    return FileResponse(path)

@router.delete("/{guard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guard(guard_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("guards", "delete"))):
    guard_service.delete_guard(db, guard_id, current_user.id)
    return None
