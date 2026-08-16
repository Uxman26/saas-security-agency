from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.schemas import CompanyUserResetPassword, PortalLoginOut, SiteCreate, SiteResponse
from app.rbac import require_internal_module, require_module
from app.services import site_service
from app.services.portal_access import redact_sites_for_portal
from app.services.portal_login_view import portal_login_out

router = APIRouter(prefix="/sites", tags=["sites"])

@router.post("", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
def create_site(site: SiteCreate, db: Session = Depends(get_db), current_user: User = Depends(require_module("sites", "create"))):
    return site_service.create_site(db, site, current_user.id)

@router.get("", response_model=List[SiteResponse])
def get_sites(db: Session = Depends(get_db), current_user: User = Depends(require_module("sites", "view"))):
    rows = site_service.get_sites(db, current_user.id)
    return redact_sites_for_portal(current_user, rows)

@router.get("/{site_id}", response_model=SiteResponse)
def get_site(site_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("sites", "view"))):
    site = site_service.get_site_by_id(db, site_id, current_user.id)
    return redact_sites_for_portal(current_user, [site])[0]

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

@router.get("/{site_id}/portal-logins", response_model=List[PortalLoginOut])
def list_site_portal_logins(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("roles", "users_view")),
):
    """Portal logins pinned to this site, shown on its edit screen.

    Guarded by the user-administration right rather than sites.edit: these are company
    login accounts, so seeing them is the same permission as seeing the Users list.
    """
    return [portal_login_out(db, u) for u in site_service.list_site_portal_logins(db, site_id, current_user.id)]


@router.post("/{site_id}/portal-logins/{login_user_id}/password", response_model=PortalLoginOut)
def set_site_portal_login_password(
    site_id: int,
    login_user_id: int,
    body: CompanyUserResetPassword,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("roles", "users_reset_password")),
):
    """Change the password on one of this site's pinned portal logins."""
    user = site_service.set_site_login_password(
        db, site_id, login_user_id, body.new_password, current_user.id
    )
    return portal_login_out(db, user)


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site(site_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("sites", "delete"))):
    site_service.delete_site(db, site_id, current_user.id)
    return None
