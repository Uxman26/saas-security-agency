from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_module
from app.schemas import (
    IncidentCreate,
    IncidentResponse,
    PatrolComplianceRow,
    PatrolTodayResponse,
    PortalHoursResponse,
    RotaDetailResponse,
    SiteResponse,
)
from app.services import incident_service, patrol_service, portal_service

router = APIRouter(prefix="/portal", tags=["portal"])


@router.get("/sites", response_model=list[SiteResponse])
def portal_sites(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    return portal_service.list_portal_sites(db, current_user)


@router.get("/rota/current", response_model=list[RotaDetailResponse])
def portal_rota_current(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "rota_current")),
):
    return portal_service.list_portal_rota(db, current_user, "current")


@router.get("/rota/upcoming", response_model=list[RotaDetailResponse])
def portal_rota_upcoming(
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "rota_upcoming")),
):
    return portal_service.list_portal_rota(db, current_user, "upcoming", end_date=end_date)


@router.get("/rota/previous", response_model=list[RotaDetailResponse])
def portal_rota_previous(
    start_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "rota_previous")),
):
    return portal_service.list_portal_rota(db, current_user, "previous", start_date=start_date)


@router.get("/hours", response_model=PortalHoursResponse)
def portal_hours(
    period: str = "week",
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "hours_view")),
):
    return portal_service.portal_hours(db, current_user, period, start_date, end_date)


@router.get("/patrol/today", response_model=PatrolTodayResponse)
def portal_patrol_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "patrol_today")),
):
    return patrol_service.today_for_guard(db, current_user)


@router.get("/patrol/compliance", response_model=list[PatrolComplianceRow])
def portal_patrol_compliance(
    start_date: date,
    end_date: date,
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "patrol_compliance")),
):
    return patrol_service.compliance_report(db, current_user, start_date, end_date, site_id)


@router.get("/incidents", response_model=list[IncidentResponse])
def portal_incidents(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "incidents_view")),
):
    return incident_service.list_incidents(db, current_user, status=status)


@router.post("/incidents", response_model=IncidentResponse, status_code=201)
def portal_create_incident(
    body: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "incidents_create")),
):
    return incident_service.create_incident(db, current_user, body)
