from __future__ import annotations

import io
import mimetypes
import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

import qrcode
from fastapi import HTTPException
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import (
    Client,
    Guard,
    PatrolAlert,
    PatrolCheckpoint,
    PatrolLog,
    PatrolRoute,
    PatrolSession,
    Site,
    User,
)
from app.schemas import (
    PatrolCheckpointCreate,
    PatrolCheckpointResponse,
    PatrolCheckpointUpdate,
    PatrolComplianceRow,
    PatrolLogResponse,
    PatrolRouteCreate,
    PatrolRouteResponse,
    PatrolRouteUpdate,
    PatrolScanRequest,
    PatrolSessionResponse,
    PatrolSessionStart,
    PatrolTodayResponse,
)
from app.services.company_service import get_company_by_user_id
from app.services.geo_utils import haversine_m
from app.services.portal_access import (
    is_client_portal_user,
    is_staff_portal_user,
    pinned_site_ids,
)
from app.storage_paths import resolve_storage_path
from app.services.recycle_bin import archive as _bin_archive


def _qr_base_url() -> str:
    return settings.frontend_url.rstrip("/")


def qr_url_for_token(token: str) -> str:
    return f"{_qr_base_url()}/patrol/check/{token}"


def _new_token() -> str:
    return secrets.token_urlsafe(18)


def _next_checkpoint_code(db: Session, company_id: int) -> str:
    n = db.query(PatrolCheckpoint).filter(PatrolCheckpoint.company_id == company_id).count() + 1
    return f"CP-{10000 + n}"


def _checkpoint_out(cp: PatrolCheckpoint) -> PatrolCheckpointResponse:
    return PatrolCheckpointResponse(
        id=cp.id,
        company_id=cp.company_id,
        site_id=cp.site_id,
        route_id=cp.route_id,
        code=cp.code,
        name=cp.name,
        floor=cp.floor,
        description=cp.description,
        qr_token=cp.qr_token,
        qr_url=qr_url_for_token(cp.qr_token),
        latitude=cp.latitude,
        longitude=cp.longitude,
        radius_m=cp.radius_m or 20,
        sort_order=cp.sort_order or 0,
        status=cp.status,
        created_at=cp.created_at,
    )


def _route_out(route: PatrolRoute, include_cps: bool = False) -> PatrolRouteResponse:
    cps = list(route.checkpoints or []) if include_cps else []
    return PatrolRouteResponse(
        id=route.id,
        company_id=route.company_id,
        site_id=route.site_id,
        site_name=route.site.name if route.site else None,
        name=route.name,
        frequency_minutes=route.frequency_minutes,
        start_time=route.start_time,
        end_time=route.end_time,
        reminder_minutes=getattr(route, "reminder_minutes", None) or 10,
        grace_minutes=getattr(route, "grace_minutes", None) or 15,
        status=route.status,
        checkpoint_count=len(route.checkpoints or []),
        created_at=route.created_at,
        checkpoints=[_checkpoint_out(c) for c in sorted(cps, key=lambda x: x.sort_order or 0)],
    )


def _log_out(log: PatrolLog) -> PatrolLogResponse:
    # Authenticated endpoint rather than a public static path — see attachment handling
    # in incident_service for the same reasoning.
    photo = f"/patrol/logs/{log.id}/photo" if log.photo_path else None
    return PatrolLogResponse(
        id=log.id,
        company_id=log.company_id,
        guard_id=log.guard_id,
        guard_name=log.guard.full_name if log.guard else None,
        checkpoint_id=log.checkpoint_id,
        checkpoint_name=log.checkpoint.name if log.checkpoint else None,
        checkpoint_code=log.checkpoint.code if log.checkpoint else None,
        route_id=log.route_id,
        route_name=log.route.name if log.route else None,
        session_id=log.session_id,
        assignment_id=log.assignment_id,
        scan_time=log.scan_time,
        latitude=log.latitude,
        longitude=log.longitude,
        accuracy=log.accuracy,
        device_id=log.device_id,
        photo_url=photo,
        distance_m=log.distance_m,
        status=log.status,
        notes=log.notes,
    )


def _parse_hm(s: str) -> time:
    parts = (s or "00:00").split(":")
    return time(int(parts[0]) % 24, int(parts[1]) % 60 if len(parts) > 1 else 0)


def _in_window(now: datetime, start_hm: str, end_hm: str) -> bool:
    t = now.timetz().replace(tzinfo=None) if now.tzinfo else now.time()
    a, b = _parse_hm(start_hm), _parse_hm(end_hm)
    if a <= b:
        return a <= t <= b
    return t >= a or t <= b


def _resolve_guard(db: Session, user: User, company_id: int, guard_id: Optional[int]) -> Guard:
    if guard_id:
        g = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company_id).first()
        if not g:
            raise HTTPException(status_code=404, detail="Guard not found")
        return g
    if getattr(user, "guard_id", None):
        g = db.query(Guard).filter(Guard.id == user.guard_id, Guard.company_id == company_id).first()
        if g:
            return g
    raise HTTPException(status_code=400, detail="guard_id is required")


def _portal_route_site_ids(db: Session, user: User) -> Optional[set[int]]:
    """Sites a portal login may see patrol config for, or None when unrestricted.

    Client scoping was already inline in each query; Staff had none, so a guard could
    list every patrol route and compliance row in the tenant, including sites they have
    never worked. filter_sites_for_user resolves both roles the same way the Sites list
    does — client's own sites, or the staff member's rota'd sites, narrowed by pins.
    """
    from app.services.portal_access import filter_sites_for_user, is_portal_role

    if not is_portal_role(user):
        return None
    q = filter_sites_for_user(db, user, db.query(Site.id).filter(Site.company_id == user.company_id))
    return {row[0] for row in q.all()}


def list_routes(db: Session, user: User, site_id: Optional[int] = None) -> list[PatrolRouteResponse]:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(PatrolRoute)
        .options(joinedload(PatrolRoute.site), joinedload(PatrolRoute.checkpoints))
        .filter(PatrolRoute.company_id == company.id)
    )
    if site_id:
        q = q.filter(PatrolRoute.site_id == site_id)
    allowed = _portal_route_site_ids(db, user)
    if allowed is not None:
        q = q.filter(PatrolRoute.site_id.in_(allowed or {0}))
    rows = q.order_by(PatrolRoute.id.desc()).all()
    return [_route_out(r, include_cps=False) for r in rows]


def get_route(db: Session, user: User, route_id: int) -> PatrolRouteResponse:
    company = get_company_by_user_id(db, user.id)
    route = (
        db.query(PatrolRoute)
        .options(joinedload(PatrolRoute.site), joinedload(PatrolRoute.checkpoints))
        .filter(PatrolRoute.id == route_id, PatrolRoute.company_id == company.id)
        .first()
    )
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    allowed = _portal_route_site_ids(db, user)
    if allowed is not None and route.site_id not in allowed:
        raise HTTPException(status_code=404, detail="Route not found")
    return _route_out(route, include_cps=True)


def _assert_site_in_portal_scope(db: Session, user: User, site_id: Optional[int]) -> None:
    """Refuse a portal login touching patrol config outside its own sites.

    patrol deliberately uses plain require_module and scopes its own queries (see
    rbac.require_internal_module), but the route and checkpoint write paths only scoped
    by company — so a Staff login holding patrol.edit or patrol.checkpoint_edit could
    rewrite the patrol configuration of every site in the tenant. 404 rather than 403,
    matching the read paths.
    """
    allowed = _portal_route_site_ids(db, user)
    if allowed is not None and site_id not in allowed:
        raise HTTPException(status_code=404, detail="Not found")


def create_route(db: Session, user: User, data: PatrolRouteCreate) -> PatrolRouteResponse:
    company = get_company_by_user_id(db, user.id)
    site = db.query(Site).filter(Site.id == data.site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    _assert_site_in_portal_scope(db, user, site.id)
    route = PatrolRoute(
        company_id=company.id,
        site_id=data.site_id,
        name=data.name.strip(),
        frequency_minutes=data.frequency_minutes,
        start_time=data.start_time,
        end_time=data.end_time,
        reminder_minutes=getattr(data, "reminder_minutes", None) or 10,
        grace_minutes=getattr(data, "grace_minutes", None) or 15,
        status=data.status or "active",
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    try:
        from app.services import patrol_schedule_service

        patrol_schedule_service.ensure_upcoming_occurrences(db, horizon_hours=24)
    except Exception:
        pass
    return get_route(db, user, route.id)


def update_route(db: Session, user: User, route_id: int, data: PatrolRouteUpdate) -> PatrolRouteResponse:
    company = get_company_by_user_id(db, user.id)
    route = db.query(PatrolRoute).filter(PatrolRoute.id == route_id, PatrolRoute.company_id == company.id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    _assert_site_in_portal_scope(db, user, route.site_id)
    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(route, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    try:
        from app.services import patrol_schedule_service

        patrol_schedule_service.ensure_upcoming_occurrences(db, horizon_hours=24)
    except Exception:
        pass
    return get_route(db, user, route_id)


def delete_route(db: Session, user: User, route_id: int) -> None:
    company = get_company_by_user_id(db, user.id)
    route = db.query(PatrolRoute).filter(PatrolRoute.id == route_id, PatrolRoute.company_id == company.id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    _assert_site_in_portal_scope(db, user, route.site_id)
    _bin_archive(route, user.id)
    db.commit()


def create_checkpoint(db: Session, user: User, data: PatrolCheckpointCreate) -> PatrolCheckpointResponse:
    company = get_company_by_user_id(db, user.id)
    route = db.query(PatrolRoute).filter(PatrolRoute.id == data.route_id, PatrolRoute.company_id == company.id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    _assert_site_in_portal_scope(db, user, route.site_id)
    cp = PatrolCheckpoint(
        company_id=company.id,
        site_id=route.site_id,
        route_id=route.id,
        code=_next_checkpoint_code(db, company.id),
        name=data.name.strip(),
        floor=data.floor,
        description=data.description,
        qr_token=_new_token(),
        latitude=data.latitude,
        longitude=data.longitude,
        radius_m=data.radius_m,
        sort_order=data.sort_order,
        status=data.status or "active",
    )
    db.add(cp)
    db.commit()
    db.refresh(cp)
    return _checkpoint_out(cp)


def update_checkpoint(db: Session, user: User, checkpoint_id: int, data: PatrolCheckpointUpdate) -> PatrolCheckpointResponse:
    company = get_company_by_user_id(db, user.id)
    cp = db.query(PatrolCheckpoint).filter(PatrolCheckpoint.id == checkpoint_id, PatrolCheckpoint.company_id == company.id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    _assert_site_in_portal_scope(db, user, cp.site_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cp, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    db.refresh(cp)
    return _checkpoint_out(cp)


def delete_checkpoint(db: Session, user: User, checkpoint_id: int) -> None:
    company = get_company_by_user_id(db, user.id)
    cp = db.query(PatrolCheckpoint).filter(PatrolCheckpoint.id == checkpoint_id, PatrolCheckpoint.company_id == company.id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    _assert_site_in_portal_scope(db, user, cp.site_id)
    db.delete(cp)
    db.commit()


def get_checkpoint(db: Session, user: User, checkpoint_id: int) -> PatrolCheckpoint:
    company = get_company_by_user_id(db, user.id)
    cp = db.query(PatrolCheckpoint).filter(PatrolCheckpoint.id == checkpoint_id, PatrolCheckpoint.company_id == company.id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return cp


def checkpoint_qr_png_bytes(cp: PatrolCheckpoint) -> bytes:
    img = qrcode.make(qr_url_for_token(cp.qr_token))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def checkpoint_qr_pdf_bytes(cp: PatrolCheckpoint) -> bytes:
    png = checkpoint_qr_png_bytes(cp)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(w / 2, h - 80, cp.name)
    c.setFont("Helvetica", 11)
    c.drawCentredString(w / 2, h - 100, cp.code)
    if cp.floor:
        c.drawCentredString(w / 2, h - 118, f"Floor: {cp.floor}")
    qr_img = ImageReader(io.BytesIO(png))
    size = 220
    c.drawImage(qr_img, (w - size) / 2, h - 380, width=size, height=size, preserveAspectRatio=True, mask="auto")
    c.setFont("Helvetica", 9)
    c.drawCentredString(w / 2, h - 410, "Scan during patrol — token only")
    c.showPage()
    c.save()
    return buf.getvalue()


def start_session(db: Session, user: User, data: PatrolSessionStart) -> PatrolSessionResponse:
    company = get_company_by_user_id(db, user.id)
    route = db.query(PatrolRoute).filter(PatrolRoute.id == data.route_id, PatrolRoute.company_id == company.id).first()
    if not route or route.status != "active":
        raise HTTPException(status_code=404, detail="Active route not found")
    guard = _resolve_guard(db, user, company.id, data.guard_id)
    # end any open session for this guard+route
    open_s = (
        db.query(PatrolSession)
        .filter(
            PatrolSession.company_id == company.id,
            PatrolSession.guard_id == guard.id,
            PatrolSession.route_id == route.id,
            PatrolSession.status == "active",
        )
        .all()
    )
    now = datetime.now(timezone.utc)
    for s in open_s:
        s.status = "ended"
        s.ended_at = now
    sess = PatrolSession(
        company_id=company.id,
        guard_id=guard.id,
        route_id=route.id,
        assignment_id=data.assignment_id,
        status="active",
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    try:
        from app.services import patrol_schedule_service

        patrol_schedule_service.ensure_upcoming_occurrences(db, horizon_hours=24)
    except Exception:
        pass
    return PatrolSessionResponse.model_validate(sess)


def scan_checkpoint(
    db: Session,
    user: User,
    data: PatrolScanRequest,
    photo_path: Optional[str] = None,
) -> PatrolLogResponse:
    company = get_company_by_user_id(db, user.id)
    cp = (
        db.query(PatrolCheckpoint)
        .options(joinedload(PatrolCheckpoint.route).joinedload(PatrolRoute.site))
        .filter(PatrolCheckpoint.qr_token == data.qr_token)
        .first()
    )
    if not cp:
        raise HTTPException(status_code=404, detail="QR checkpoint not found")
    if cp.status != "active":
        raise HTTPException(status_code=400, detail="Checkpoint is inactive")
    if cp.company_id != company.id:
        raise HTTPException(status_code=403, detail="Checkpoint does not belong to your organisation")

    guard = _resolve_guard(db, user, company.id, data.guard_id)
    route = cp.route
    if not route or route.status != "active":
        raise HTTPException(status_code=400, detail="Patrol route is inactive")

    # Guard must be assigned to this site (active session or today's assignment) unless admin scanning with explicit session
    session_id = data.session_id
    open_s = None
    if not session_id:
        open_s = (
            db.query(PatrolSession)
            .filter(
                PatrolSession.company_id == company.id,
                PatrolSession.guard_id == guard.id,
                PatrolSession.route_id == cp.route_id,
                PatrolSession.status == "active",
            )
            .order_by(PatrolSession.id.desc())
            .first()
        )
        session_id = open_s.id if open_s else None
    from app.models import Assignment

    today = date.today()
    has_assignment = (
        db.query(Assignment.id)
        .filter(Assignment.guard_id == guard.id, Assignment.site_id == cp.site_id, Assignment.date == today)
        .first()
    )
    if not session_id and not has_assignment and is_staff_portal_user(user):
        raise HTTPException(status_code=403, detail="You are not assigned to patrol this site today")

    distance = haversine_m(cp.latitude, cp.longitude, data.latitude, data.longitude)
    radius = cp.radius_m or 20
    now = datetime.now(timezone.utc)
    status = "completed"
    notes = None
    late_minutes = None
    occurrence = None

    from app.services import patrol_schedule_service

    site_ok, site_dist = patrol_schedule_service.site_geofence_ok(
        route.site if route else None, data.latitude, data.longitude
    )
    if not site_ok:
        status = "failed_gps"
        notes = f"Outside site geofence ({site_dist}m)"
    elif distance > radius:
        status = "failed_gps"
        notes = f"GPS {distance:.1f}m outside checkpoint {radius:.0f}m radius"
    else:
        grace = int(getattr(route, "grace_minutes", None) or 15)
        early = int(getattr(route, "reminder_minutes", None) or 10) + 5
        occurrence = patrol_schedule_service.match_open_occurrence(
            db,
            checkpoint_id=cp.id,
            guard_id=guard.id,
            now=now,
            grace_minutes=grace,
            early_minutes=early,
        )
        if occurrence and occurrence.scheduled_at:
            scheduled = occurrence.scheduled_at
            if scheduled.tzinfo is None:
                scheduled = scheduled.replace(tzinfo=timezone.utc)
            delta_min = (now - scheduled).total_seconds() / 60.0
            if delta_min > 0:
                status = "completed_late"
                late_minutes = round(delta_min, 1)
                notes = f"Completed late by {late_minutes} minutes"
            else:
                status = "completed"
                notes = "Completed on time"
        elif not _in_window(now, route.start_time, route.end_time):
            status = "completed_late"
            notes = "Scanned outside scheduled window"

    log = PatrolLog(
        company_id=company.id,
        guard_id=guard.id,
        checkpoint_id=cp.id,
        route_id=cp.route_id,
        session_id=session_id,
        assignment_id=data.assignment_id or (has_assignment[0] if has_assignment else None),
        occurrence_id=occurrence.id if occurrence else None,
        scan_time=now,
        latitude=data.latitude,
        longitude=data.longitude,
        accuracy=data.accuracy,
        device_id=data.device_id,
        photo_path=photo_path,
        distance_m=round(distance, 2),
        status=status,
        notes=notes,
    )
    db.add(log)
    db.flush()
    if occurrence and status in ("completed", "completed_late"):
        occurrence.status = status
        occurrence.completed_at = now
        occurrence.late_minutes = late_minutes
        occurrence.log_id = log.id
        if occurrence.session_id is None and session_id:
            occurrence.session_id = session_id
    db.commit()
    log = (
        db.query(PatrolLog)
        .options(joinedload(PatrolLog.guard), joinedload(PatrolLog.checkpoint), joinedload(PatrolLog.route))
        .filter(PatrolLog.id == log.id)
        .first()
    )
    return _log_out(log)


def list_logs(
    db: Session,
    user: User,
    *,
    site_id: Optional[int] = None,
    route_id: Optional[int] = None,
    guard_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> list[PatrolLogResponse]:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(PatrolLog)
        .options(joinedload(PatrolLog.guard), joinedload(PatrolLog.checkpoint), joinedload(PatrolLog.route))
        .filter(PatrolLog.company_id == company.id)
    )
    if route_id:
        q = q.filter(PatrolLog.route_id == route_id)
    if guard_id:
        q = q.filter(PatrolLog.guard_id == guard_id)
    if site_id:
        q = q.join(PatrolCheckpoint).filter(PatrolCheckpoint.site_id == site_id)
    if is_client_portal_user(user) and user.client_id:
        q = q.join(PatrolRoute).join(Site).filter(Site.client_id == user.client_id)
        pinned = pinned_site_ids(db, user)
        if pinned is not None:
            q = q.filter(PatrolRoute.site_id.in_(pinned))
    if is_staff_portal_user(user) and user.guard_id:
        q = q.filter(PatrolLog.guard_id == user.guard_id)
    if start_date:
        q = q.filter(PatrolLog.scan_time >= datetime.combine(start_date, time.min))
    if end_date:
        q = q.filter(PatrolLog.scan_time <= datetime.combine(end_date, time.max))
    rows = q.order_by(PatrolLog.scan_time.desc()).limit(500).all()
    return [_log_out(r) for r in rows]


def log_photo_file(db: Session, user: User, log_id: int) -> tuple[str, str]:
    """Resolve a patrol scan photo, applying the same scoping as list_logs.

    Client-portal users see only their own sites' scans and staff-portal users only
    their own, so the narrowing is repeated here rather than trusting the log's
    company_id alone.
    """
    company = get_company_by_user_id(db, user.id)
    q = db.query(PatrolLog).filter(PatrolLog.id == log_id, PatrolLog.company_id == company.id)
    if is_client_portal_user(user) and user.client_id:
        q = q.join(PatrolRoute).join(Site).filter(Site.client_id == user.client_id)
        pinned = pinned_site_ids(db, user)
        if pinned is not None:
            q = q.filter(PatrolRoute.site_id.in_(pinned))
    if is_staff_portal_user(user) and user.guard_id:
        q = q.filter(PatrolLog.guard_id == user.guard_id)
    log = q.first()
    if not log or not log.photo_path:
        raise HTTPException(status_code=404, detail="Photo not found")
    path = resolve_storage_path(log.photo_path)
    if not path:
        raise HTTPException(status_code=404, detail="Photo not found")
    mime, _ = mimetypes.guess_type(path)
    return path, mime or "application/octet-stream"


def compliance_report(
    db: Session,
    user: User,
    start_date: date,
    end_date: date,
    site_id: Optional[int] = None,
) -> list[PatrolComplianceRow]:
    from app.models import PatrolOccurrence

    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(PatrolRoute)
        .options(joinedload(PatrolRoute.site).joinedload(Site.client), joinedload(PatrolRoute.checkpoints))
        .filter(PatrolRoute.company_id == company.id, PatrolRoute.status == "active")
    )
    if site_id:
        q = q.filter(PatrolRoute.site_id == site_id)
    allowed = _portal_route_site_ids(db, user)
    if allowed is not None:
        q = q.filter(PatrolRoute.site_id.in_(allowed or {0}))
    routes = q.all()
    out: list[PatrolComplianceRow] = []
    day = start_date
    while day <= end_date:
        day_start = datetime.combine(day, time.min, tzinfo=timezone.utc)
        day_end = datetime.combine(day, time.max, tzinfo=timezone.utc)
        for route in routes:
            cps = [c for c in (route.checkpoints or []) if c.status == "active"]
            if not cps:
                continue
            rows = (
                db.query(PatrolOccurrence)
                .filter(
                    PatrolOccurrence.route_id == route.id,
                    PatrolOccurrence.scheduled_at >= day_start,
                    PatrolOccurrence.scheduled_at <= day_end,
                )
                .all()
            )
            if rows:
                required = len(rows)
                completed = sum(1 for r in rows if r.status in ("completed", "completed_late"))
                late = sum(1 for r in rows if r.status == "completed_late")
                missed = sum(1 for r in rows if r.status == "missed")
            else:
                # Fallback when occurrences not yet generated: estimate from schedule + scans
                freq = max(route.frequency_minutes or 60, 5)
                loops = max(1, int((8 * 60) / freq))
                required = len(cps) * loops
                logs = (
                    db.query(PatrolLog)
                    .filter(
                        PatrolLog.route_id == route.id,
                        PatrolLog.scan_time >= day_start,
                        PatrolLog.scan_time <= day_end,
                    )
                    .all()
                )
                completed = sum(1 for l in logs if l.status in ("completed", "completed_late"))
                late = sum(1 for l in logs if l.status == "completed_late")
                missed = max(0, required - completed)
            pct = round(100.0 * completed / required, 1) if required else 100.0
            site = route.site
            out.append(
                PatrolComplianceRow(
                    site_id=route.site_id,
                    site_name=site.name if site else "",
                    client_id=site.client_id if site else None,
                    client_name=site.client.name if site and site.client else None,
                    route_id=route.id,
                    route_name=route.name,
                    date=day,
                    required_patrols=required,
                    completed=completed,
                    missed=missed,
                    late=late,
                    compliance_pct=min(100.0, pct),
                )
            )
        day += timedelta(days=1)
    return out


def detail_report(
    db: Session,
    user: User,
    start_date: date,
    end_date: date,
    route_id: Optional[int] = None,
) -> list[PatrolLogResponse]:
    return list_logs(db, user, route_id=route_id, start_date=start_date, end_date=end_date)


def today_for_guard(db: Session, user: User) -> PatrolTodayResponse:
    company = get_company_by_user_id(db, user.id)
    guard = _resolve_guard(db, user, company.id, None) if getattr(user, "guard_id", None) else None
    if not guard and is_staff_portal_user(user):
        raise HTTPException(status_code=400, detail="Staff user is not linked to a guard profile")
    if not guard:
        # admin preview: empty
        return PatrolTodayResponse()
    sess = (
        db.query(PatrolSession)
        .options(joinedload(PatrolSession.route).joinedload(PatrolRoute.checkpoints).joinedload(PatrolCheckpoint.site))
        .filter(
            PatrolSession.company_id == company.id,
            PatrolSession.guard_id == guard.id,
            PatrolSession.status == "active",
        )
        .order_by(PatrolSession.id.desc())
        .first()
    )
    recent = list_logs(db, user, guard_id=guard.id, start_date=date.today(), end_date=date.today())[:10]
    if not sess:
        return PatrolTodayResponse(recent_logs=recent)
    route = sess.route
    cps = sorted([c for c in (route.checkpoints or []) if c.status == "active"], key=lambda x: x.sort_order or 0)
    scanned_ids = {l.checkpoint_id for l in recent if l.status in ("completed", "completed_late")}
    nxt = next((c for c in cps if c.id not in scanned_ids), cps[0] if cps else None)
    return PatrolTodayResponse(
        session=PatrolSessionResponse.model_validate(sess),
        route_id=route.id if route else None,
        route_name=route.name if route else None,
        site_name=route.site.name if route and route.site else None,
        next_checkpoint=_checkpoint_out(nxt) if nxt else None,
        due_at=route.start_time if route else None,
        recent_logs=recent,
    )


def detect_missed_patrols(db: Session) -> dict:
    from app.services import patrol_schedule_service

    return patrol_schedule_service.sweep_patrol_schedule(db)


def dashboard_kpis(db: Session, user: User, start: date, end: date) -> dict:
    company = get_company_by_user_id(db, user.id)
    from app.services import patrol_schedule_service

    return patrol_schedule_service.dashboard_kpis(db, company.id, start, end)


def list_occurrences(
    db: Session,
    user: User,
    *,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    site_id: Optional[int] = None,
    guard_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = 200,
):
    from app.models import PatrolOccurrence
    from app.schemas import PatrolOccurrenceResponse

    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(PatrolOccurrence)
        .options(
            joinedload(PatrolOccurrence.site),
            joinedload(PatrolOccurrence.route),
            joinedload(PatrolOccurrence.checkpoint),
            joinedload(PatrolOccurrence.guard),
        )
        .filter(PatrolOccurrence.company_id == company.id)
    )
    allowed = _portal_route_site_ids(db, user)
    if allowed is not None:
        q = q.filter(PatrolOccurrence.site_id.in_(allowed or {0}))
    if site_id:
        q = q.filter(PatrolOccurrence.site_id == site_id)
    if guard_id:
        q = q.filter(PatrolOccurrence.guard_id == guard_id)
    if status:
        q = q.filter(PatrolOccurrence.status == status)
    if start_date:
        q = q.filter(PatrolOccurrence.scheduled_at >= datetime.combine(start_date, time.min, tzinfo=timezone.utc))
    if end_date:
        q = q.filter(PatrolOccurrence.scheduled_at <= datetime.combine(end_date, time.max, tzinfo=timezone.utc))
    rows = q.order_by(PatrolOccurrence.scheduled_at.desc()).limit(min(limit, 500)).all()
    return [
        PatrolOccurrenceResponse(
            id=r.id,
            company_id=r.company_id,
            site_id=r.site_id,
            site_name=r.site.name if r.site else None,
            route_id=r.route_id,
            route_name=r.route.name if r.route else None,
            checkpoint_id=r.checkpoint_id,
            checkpoint_name=r.checkpoint.name if r.checkpoint else None,
            checkpoint_code=r.checkpoint.code if r.checkpoint else None,
            guard_id=r.guard_id,
            guard_name=r.guard.full_name if r.guard else None,
            session_id=r.session_id,
            assignment_id=r.assignment_id,
            scheduled_at=r.scheduled_at,
            status=r.status,
            reminder_sent_at=r.reminder_sent_at,
            completed_at=r.completed_at,
            late_minutes=r.late_minutes,
            log_id=r.log_id,
        )
        for r in rows
    ]
