from fastapi import APIRouter, Depends, status, Query, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from app.database import get_db
from app.models import User
from app.schemas import (
    CompanyUserResetPassword,
    DeleteImpactResponse,
    GuardCreate,
    GuardResponse,
    PortalLoginCreate,
    PortalLoginOut,
)
from app.rbac import require_internal_module, user_has_permission_db
from app.services import guard_service
from app.services.portal_login_view import portal_login_out
from app.storage_paths import GUARD_PHOTOS_DIR, ensure_upload_dirs, resolve_storage_path
from app.services.image_avif_service import AVIF_EXT, is_image_filename, save_upload_as_avif

router = APIRouter(prefix="/guards", tags=["guards"])

@router.post("", response_model=GuardResponse, status_code=status.HTTP_201_CREATED)
def create_guard(guard: GuardCreate, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("guards", "create"))):
    return guard_service.create_guard(db, guard, current_user.id)

@router.get("", response_model=List[GuardResponse])
def get_guards(
    area: Optional[str] = Query(None),
    postcode: Optional[str] = Query(None),
    nearby: Optional[str] = Query(None),
    view: str = Query("active"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "view")),
):
    """Staff. `view` is active (the default), archived, or all."""
    if view != "active" and not user_has_permission_db(db, current_user, "guards.archived_view"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return guard_service.get_guards(
        db, current_user.id, area=area, postcode=postcode, nearby=nearby, view=view
    )

@router.get("/{guard_id}", response_model=GuardResponse)
def get_guard(guard_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("guards", "view"))):
    return guard_service.get_guard_by_id(db, guard_id, current_user.id)

@router.put("/{guard_id}", response_model=GuardResponse)
def update_guard(guard_id: int, guard: GuardCreate, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("guards", "edit"))):
    # Logins are created only on the POST path. Silently ignoring the flag here would let
    # an edit look like it provisioned access when it did nothing.
    if guard.create_login:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A portal login cannot be created from an edit. Use Roles & Permissions → Users.",
        )
    return guard_service.update_guard(db, guard_id, guard, current_user.id)


@router.get("/{guard_id}/portal-logins", response_model=List[PortalLoginOut])
def list_guard_portal_logins(
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("roles", "users_view")),
):
    """Portal logins attached to this staff member, shown on their edit screen.

    Guarded by the user-administration right rather than guards.edit: these are company
    login accounts, so seeing them is the same permission as seeing the Users list.
    """
    return [portal_login_out(db, u) for u in guard_service.list_guard_portal_logins(db, guard_id, current_user.id)]


@router.post("/{guard_id}/portal-logins", response_model=PortalLoginOut, status_code=status.HTTP_201_CREATED)
def create_guard_portal_login(
    guard_id: int,
    body: PortalLoginCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("roles", "users_create")),
):
    """Give an existing staff member a portal login."""
    user = guard_service.create_guard_portal_login(
        db, guard_id, body.email, body.password, current_user.id
    )
    return portal_login_out(db, user)


@router.post("/{guard_id}/portal-logins/{login_user_id}/password", response_model=PortalLoginOut)
def set_guard_portal_login_password(
    guard_id: int,
    login_user_id: int,
    body: CompanyUserResetPassword,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("roles", "users_reset_password")),
):
    """Change the password on one of this staff member's portal logins."""
    user = guard_service.set_guard_login_password(
        db, guard_id, login_user_id, body.new_password, current_user.id
    )
    return portal_login_out(db, user)


@router.post("/{guard_id}/photo", response_model=GuardResponse)
def upload_guard_photo(
    guard_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "photo_upload")),
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
    current_user: User = Depends(require_internal_module("guards", "photo_view")),
):
    guard = guard_service.get_guard_by_id(db, guard_id, current_user.id)
    path = resolve_storage_path(guard.photo_path)
    if not path:
        raise HTTPException(status_code=404, detail="No photo")
    return FileResponse(path)

@router.get("/{guard_id}/delete-impact", response_model=DeleteImpactResponse)
def guard_delete_impact(
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "delete")),
):
    """What a permanent delete would destroy, for the confirmation dialog to spell out."""
    return guard_service.guard_delete_impact(db, guard_id, current_user.id)


@router.post("/{guard_id}/restore", response_model=GuardResponse)
def restore_guard(
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "restore")),
):
    """Bring an archived staff member back. Their portal login stays disabled."""
    return guard_service.restore_guard(db, guard_id, current_user.id)


@router.delete("/{guard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guard(
    guard_id: int,
    permanent: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("guards", "delete")),
):
    """Archive the staff member, or destroy the record with `permanent=true`.

    Archiving is the default: they leave the Staff list and their portal login is
    switched off, while their shifts, attendance and payroll stay readable. A permanent
    delete takes all of that with them and cannot be undone.
    """
    if permanent:
        if not user_has_permission_db(db, current_user, "guards.delete_permanent"):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        guard_service.delete_guard(db, guard_id, current_user.id)
        return None
    if not user_has_permission_db(db, current_user, "guards.archive"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    guard_service.archive_guard(db, guard_id, current_user.id)
    return None
