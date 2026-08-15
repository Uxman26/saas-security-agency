from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.schemas import SiteCreate, SiteResponse
from app.rbac import require_module
from app.services import site_service

router = APIRouter(prefix="/sites", tags=["sites"])

@router.post("", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
def create_site(site: SiteCreate, db: Session = Depends(get_db), current_user: User = Depends(require_module("sites", "create"))):
    return site_service.create_site(db, site, current_user.id)

@router.get("", response_model=List[SiteResponse])
def get_sites(db: Session = Depends(get_db), current_user: User = Depends(require_module("sites", "view"))):
    return site_service.get_sites(db, current_user.id)

@router.get("/{site_id}", response_model=SiteResponse)
def get_site(site_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("sites", "view"))):
    return site_service.get_site_by_id(db, site_id, current_user.id)

@router.put("/{site_id}", response_model=SiteResponse)
def update_site(site_id: int, site: SiteCreate, db: Session = Depends(get_db), current_user: User = Depends(require_module("sites", "edit"))):
    # Logins are created only on the POST path. Silently ignoring the flag here would let
    # an edit look like it provisioned access when it did nothing.
    if site.create_login:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A portal login cannot be created from an edit. Use Roles & Permissions → Users.",
        )
    return site_service.update_site(db, site_id, site, current_user.id)

@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site(site_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("sites", "delete"))):
    site_service.delete_site(db, site_id, current_user.id)
    return None
