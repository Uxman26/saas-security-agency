from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Site, User
from app.schemas import PortalHoursResponse, RotaDetailResponse, SiteResponse
from app.services.company_service import get_company_by_user_id
from app.services.portal_access import filter_sites_for_user, get_linked_guard, role_slug
from app.services.rota_service import list_rota_details


def _week_bounds(d: date) -> tuple[date, date]:
    start = d - timedelta(days=d.weekday())
    return start, start + timedelta(days=6)


def _month_bounds(d: date) -> tuple[date, date]:
    start = d.replace(day=1)
    if start.month == 12:
        next_month = start.replace(year=start.year + 1, month=1, day=1)
    else:
        next_month = start.replace(month=start.month + 1, day=1)
    return start, next_month - timedelta(days=1)


def _resolve_hours_range(period: str, start: Optional[date], end: Optional[date]) -> tuple[date, date, str]:
    today = date.today()
    p = (period or "week").lower().strip()
    if p == "month":
        s, e = _month_bounds(today)
        return s, e, "month"
    if p == "custom":
        if not start or not end:
            raise HTTPException(status_code=400, detail="start_date and end_date are required for custom period")
        if end < start:
            raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
        return start, end, "custom"
    s, e = _week_bounds(today)
    return s, e, "week"


def _rota_scope_ids(user: User, db: Session) -> tuple[Optional[int], Optional[int]]:
    slug = role_slug(user)
    if slug == "client":
        if not user.client_id:
            raise HTTPException(status_code=403, detail="Client account is not linked to a client record")
        return None, user.client_id
    if slug == "staff":
        guard = get_linked_guard(db, user)
        if not guard:
            raise HTTPException(status_code=403, detail="Staff account is not linked to a staff profile")
        return guard.id, None
    raise HTTPException(status_code=403, detail="Portal access is only available to Client and Staff roles")


def list_portal_sites(db: Session, user: User) -> List[SiteResponse]:
    company = get_company_by_user_id(db, user.id)
    q = db.query(Site).filter(Site.company_id == company.id)
    q = filter_sites_for_user(db, user, q)
    rows = q.order_by(Site.name).all()
    return [SiteResponse.model_validate(s) for s in rows]


def list_portal_rota(
    db: Session,
    user: User,
    mode: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> List[RotaDetailResponse]:
    guard_id, client_id = _rota_scope_ids(user, db)
    today = date.today()
    mode_l = (mode or "current").lower().strip()
    if mode_l == "current":
        start_date, end_date = _week_bounds(today)
    elif mode_l == "upcoming":
        start_date = today + timedelta(days=1)
        end_date = end_date or (today + timedelta(days=90))
    elif mode_l == "previous":
        end_date = today - timedelta(days=1)
        start_date = start_date or (today - timedelta(days=90))
    else:
        raise HTTPException(status_code=400, detail="Invalid rota mode")
    if end_date < start_date:
        return []
    return list_rota_details(
        db,
        user.id,
        start_date=start_date,
        end_date=end_date,
        guard_id=guard_id,
        site_id=None,
        client_id=client_id,
    )


def portal_hours(
    db: Session,
    user: User,
    period: str,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> PortalHoursResponse:
    guard_id, client_id = _rota_scope_ids(user, db)
    start_date, end_date, label = _resolve_hours_range(period, start, end)
    rows = list_rota_details(
        db,
        user.id,
        start_date=start_date,
        end_date=end_date,
        guard_id=guard_id,
        site_id=None,
        client_id=client_id,
    )
    total = round(sum(r.hours for r in rows), 2)
    return PortalHoursResponse(
        period=label,
        start_date=start_date,
        end_date=end_date,
        total_hours=total,
        shifts_count=len(rows),
    )
