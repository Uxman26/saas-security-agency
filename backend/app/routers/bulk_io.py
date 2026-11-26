from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.rbac import user_has_permission_db
from app.services import bulk_io_service
from app.services.plan_enforcement import enforce_module_entitlement

router = APIRouter(prefix="/bulk", tags=["bulk-io"])


def _parse_ids(ids: Optional[list[str]]) -> Optional[list[Any]]:
    if not ids:
        return None
    out: list[Any] = []
    for raw in ids:
        for part in str(raw).split(","):
            p = part.strip()
            if not p:
                continue
            if p.isdigit():
                out.append(int(p))
            else:
                out.append(p)
    return out or None


def _require(db: Session, user: User, module_key: str, action: str) -> None:
    if not user_has_permission_db(db, user, f"{module_key}.{action}"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    enforce_module_entitlement(db, user, module_key)


@router.get("/{module}/template")
def download_template(
    module: str,
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    spec = bulk_io_service.get_spec(module)
    if user_has_permission_db(db, current_user, f"{spec.perm_module}.import"):
        enforce_module_entitlement(db, current_user, spec.perm_module)
    else:
        _require(db, current_user, spec.perm_module, "create")
    body, media, filename = bulk_io_service.template_bytes(module, format)
    return Response(
        content=body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{module}/export")
def export_records(
    module: str,
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    ids: Optional[list[str]] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    spec = bulk_io_service.get_spec(module)
    if user_has_permission_db(db, current_user, f"{spec.perm_module}.export"):
        enforce_module_entitlement(db, current_user, spec.perm_module)
    else:
        _require(db, current_user, spec.perm_module, "view")
    body, media, filename = bulk_io_service.export_bytes(
        db, current_user, module, fmt=format, ids=_parse_ids(ids)
    )
    return Response(
        content=body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{module}/import/preview")
async def import_preview(
    module: str,
    file: UploadFile = File(...),
    update_existing: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    spec = bulk_io_service.get_spec(module)
    _require(db, current_user, spec.perm_module, "import")
    if update_existing:
        _require(db, current_user, spec.perm_module, "edit")
    return bulk_io_service.preview_import(
        db, current_user, module, file, update_existing=update_existing
    )


@router.post("/{module}/import")
async def import_commit(
    module: str,
    file: UploadFile = File(...),
    update_existing: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    spec = bulk_io_service.get_spec(module)
    _require(db, current_user, spec.perm_module, "import")
    if update_existing:
        _require(db, current_user, spec.perm_module, "edit")
    return bulk_io_service.commit_import(
        db, current_user, module, file, update_existing=update_existing
    )
