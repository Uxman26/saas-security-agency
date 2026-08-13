from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppModule, User
from app.module_actions import actions_for_module
from app.rbac import permission_bypass, require_module
from app.schemas import AppModuleActionOut, AppModuleCreate, AppModuleOut, AppModuleUpdate
from app.services.module_service import ensure_app_modules, list_all_modules, list_active_modules

router = APIRouter(prefix="/modules", tags=["modules"])


def _out(m: AppModule) -> AppModuleOut:
    return AppModuleOut(
        id=m.id,
        key=m.key,
        name=m.name,
        icon=m.icon,
        sidebar_path=m.sidebar_path,
        sidebar_order=m.sidebar_order,
        section_key=m.section_key,
        is_active=m.is_active,
        actions=[
            AppModuleActionOut(key=a.key, label=a.label, parent=a.parent)
            for a in actions_for_module(m.key)
        ],
    )


@router.get("", response_model=list[AppModuleOut])
def list_modules(
    all_modules: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("roles", "modules_view")),
):
    ensure_app_modules(db)
    db.commit()
    rows = list_all_modules(db) if all_modules else list_active_modules(db)
    return [_out(m) for m in rows]


@router.post("", response_model=AppModuleOut, status_code=status.HTTP_201_CREATED)
def create_module(
    body: AppModuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("roles", "modules_manage")),
):
    if not permission_bypass(db, current_user):
        raise HTTPException(status_code=403, detail="Only admins can create modules")
    key = body.key.strip().lower().replace(" ", "_")
    if db.query(AppModule).filter(AppModule.key == key).first():
        raise HTTPException(status_code=400, detail="Module key already exists")
    m = AppModule(
        key=key,
        name=body.name.strip(),
        icon=body.icon.strip() or "LayoutDashboard",
        sidebar_path=body.sidebar_path.strip(),
        sidebar_order=body.sidebar_order,
        section_key=body.section_key.strip() or "sectionOperations",
        is_active=True,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _out(m)


@router.patch("/{module_id}", response_model=AppModuleOut)
def update_module(
    module_id: int,
    body: AppModuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("roles", "modules_manage")),
):
    # AppModule is a platform-wide table with no company_id, so an edit here is
    # visible to every tenant. Mirror the admin-only gate on create_module.
    if not permission_bypass(db, current_user):
        raise HTTPException(status_code=403, detail="Only admins can edit modules")
    m = db.query(AppModule).filter(AppModule.id == module_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Module not found")
    if body.name is not None:
        m.name = body.name.strip()
    if body.icon is not None:
        m.icon = body.icon.strip() or m.icon
    if body.sidebar_path is not None:
        m.sidebar_path = body.sidebar_path.strip()
    if body.sidebar_order is not None:
        m.sidebar_order = body.sidebar_order
    if body.section_key is not None:
        m.section_key = body.section_key.strip()
    if body.is_active is not None:
        m.is_active = body.is_active
    db.commit()
    db.refresh(m)
    return _out(m)
