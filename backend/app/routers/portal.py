from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import (
    PERM_PORTAL_HOURS,
    PERM_PORTAL_ROTA_CURRENT,
    PERM_PORTAL_ROTA_PREVIOUS,
    PERM_PORTAL_ROTA_UPCOMING,
    PERM_PORTAL_SITES,
    require_perm,
)
from app.schemas import PortalHoursResponse, RotaDetailResponse, SiteResponse
from app.services import portal_service

router = APIRouter(prefix="/portal", tags=["portal"])


@router.get("/sites", response_model=list[SiteResponse])
def portal_sites(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_PORTAL_SITES)),
):
    return portal_service.list_portal_sites(db, current_user)


@router.get("/rota/current", response_model=list[RotaDetailResponse])
def portal_rota_current(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_PORTAL_ROTA_CURRENT)),
):
    return portal_service.list_portal_rota(db, current_user, "current")


@router.get("/rota/upcoming", response_model=list[RotaDetailResponse])
def portal_rota_upcoming(
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_PORTAL_ROTA_UPCOMING)),
):
    return portal_service.list_portal_rota(db, current_user, "upcoming", end_date=end_date)


@router.get("/rota/previous", response_model=list[RotaDetailResponse])
def portal_rota_previous(
    start_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_PORTAL_ROTA_PREVIOUS)),
):
    return portal_service.list_portal_rota(db, current_user, "previous", start_date=start_date)


@router.get("/hours", response_model=PortalHoursResponse)
def portal_hours(
    period: str = "week",
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_PORTAL_HOURS)),
):
    return portal_service.portal_hours(db, current_user, period, start_date, end_date)
