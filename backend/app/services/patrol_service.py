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
        status=data.status or "active",
    )
    db.add(route)
    db.commit()
    db.refresh(route)
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
    return get_route(db, user, route_id)


def delete_route(db: Session, user: User, route_id: int) -> None:
    company = get_company_by_user_id(db, user.id)
    route = db.query(PatrolRoute).filter(PatrolRoute.id == route_id, PatrolRoute.company_id == company.id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    _assert_site_in_portal_scope(db, user, route.site_id)
    db.delete(route)
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
        .options(joinedload(PatrolCheckpoint.route))
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
    distance = haversine_m(cp.latitude, cp.longitude, data.latitude, data.longitude)
    radius = cp.radius_m or 20
    now = datetime.now(timezone.utc)
    status = "completed"
    notes = None
    if distance > radius:
        status = "failed_gps"
        notes = f"GPS {distance:.1f}m outside {radius:.0f}m radius"
    else:
        route = cp.route
        if route and not _in_window(now, route.start_time, route.end_time):
            status = "completed_late"
            notes = "Scanned outside scheduled window"
        elif route:
            # late if last successful scan for this checkpoint was longer than frequency ago beyond grace
            last = (
                db.query(PatrolLog)
                .filter(
                    PatrolLog.checkpoint_id == cp.id,
                    PatrolLog.guard_id == guard.id,
                    PatrolLog.status.in_(["completed", "completed_late"]),
                )
                .order_by(PatrolLog.scan_time.desc())
                .first()
            )
            # first scan in window is on-time; subsequent cadence checked in reports
            if last and last.scan_time:
                delta = (now - last.scan_time.replace(tzinfo=timezone.utc) if last.scan_time.tzinfo is None else now - last.scan_time).total_seconds() / 60
                # if they scan again very late relative to frequency, mark late
                if delta > (route.frequency_minutes or 60) * 1.25:
                    status = "completed_late"
                    notes = "Completed late vs frequency"

    session_id = data.session_id
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

    log = PatrolLog(
        company_id=company.id,
        guard_id=guard.id,
        checkpoint_id=cp.id,
        route_id=cp.route_id,
        session_id=session_id,
        assignment_id=data.assignment_id,
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
        for route in routes:
            cps = [c for c in (route.checkpoints or []) if c.status == "active"]
            if not cps:
                continue
            # required = checkpoints * expected loops in window (simplified: 1 loop per frequency in 8h default window)
            freq = max(route.frequency_minutes or 60, 5)
            # approximate loops overnight: 8 hours / frequency
            loops = max(1, int((8 * 60) / freq))
            required = len(cps) * loops
            day_start = datetime.combine(day, time.min)
            day_end = datetime.combine(day, time.max)
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
    """ARQ job: find active sessions/routes with overdue checkpoints and create alerts."""
    now = datetime.now(timezone.utc)
    created = 0
    sessions = (
        db.query(PatrolSession)
        .options(joinedload(PatrolSession.route).joinedload(PatrolRoute.checkpoints))
        .filter(PatrolSession.status == "active")
        .all()
    )
    for sess in sessions:
        route = sess.route
        if not route or route.status != "active":
            continue
        if not _in_window(now, route.start_time, route.end_time):
            continue
        freq = timedelta(minutes=max(route.frequency_minutes or 60, 5))
        for cp in route.checkpoints or []:
            if cp.status != "active":
                continue
            last = (
                db.query(PatrolLog)
                .filter(
                    PatrolLog.session_id == sess.id,
                    PatrolLog.checkpoint_id == cp.id,
                    PatrolLog.status.in_(["completed", "completed_late"]),
                )
                .order_by(PatrolLog.scan_time.desc())
                .first()
            )
            since = last.scan_time if last else sess.started_at
            if since and since.tzinfo is None:
                since = since.replace(tzinfo=timezone.utc)
            if not since:
                continue
            if now - since < freq:
                continue
            # avoid duplicate alerts in same window
            existing = (
                db.query(PatrolAlert)
                .filter(
                    PatrolAlert.session_id == sess.id,
                    PatrolAlert.checkpoint_id == cp.id,
                    PatrolAlert.created_at >= now - freq,
                )
                .first()
            )
            if existing:
                continue
            msg = f"Missed patrol checkpoint {cp.name} ({cp.code}) on route {route.name}"
            alert = PatrolAlert(
                company_id=sess.company_id,
                route_id=route.id,
                checkpoint_id=cp.id,
                session_id=sess.id,
                guard_id=sess.guard_id,
                alert_type="missed_checkpoint",
                message=msg,
                window_start=since,
                window_end=now,
            )
            db.add(alert)
            created += 1
            try:
                from app.services import email_service

                company_users = db.query(User).filter(User.company_id == sess.company_id, User.role.in_(["company_admin", "manager", "supervisor"])).limit(5).all()
                for u in company_users:
                    if u.email:
                        email_service.send_email(u.email, "Missed patrol alert", msg)
                        alert.notified_at = now
            except Exception:
                pass
    db.commit()
    return {"alerts_created": created}
