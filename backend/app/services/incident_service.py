from __future__ import annotations

import os
from datetime import date, datetime, time, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.authz import assert_owned_by_company
from app.models import Assignment, Client, Guard, Incident, IncidentAttachment, Site, User
from app.schemas import (
    IncidentAttachmentResponse,
    IncidentCreate,
    IncidentResponse,
    IncidentSummaryRow,
    IncidentUpdate,
)
from app.services.company_service import get_company_by_user_id
from app.services.portal_access import (
    is_client_portal_user,
    is_staff_portal_user,
    pinned_site_ids,
)
from app.storage_paths import resolve_storage_path


def _att_out(a: IncidentAttachment) -> IncidentAttachmentResponse:
    # Points at an authenticated endpoint, not the raw file. Incident photos used to be
    # served from a public static mount, so anyone with the path could read another
    # tenant's evidence without logging in.
    return IncidentAttachmentResponse(
        id=a.id,
        file_path=a.file_path,
        mime_type=a.mime_type,
        url=f"/incidents/{a.incident_id}/attachments/{a.id}/file",
        created_at=a.created_at,
    )


def attachment_file(db: Session, user: User, incident_id: int, attachment_id: int) -> tuple[str, str]:
    """Resolve an attachment to an on-disk path, scoped to the caller's tenant.

    Goes through get_incident so the client-portal and staff-portal narrowing applies
    here exactly as it does when listing incidents.
    """
    incident = get_incident(db, user, incident_id)
    att = (
        db.query(IncidentAttachment)
        .filter(
            IncidentAttachment.id == attachment_id,
            IncidentAttachment.incident_id == incident.id,
        )
        .first()
    )
    if not att or not att.file_path:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = resolve_storage_path(att.file_path)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Attachment not found")
    return path, (att.mime_type or "application/octet-stream")


def _out(inc: Incident) -> IncidentResponse:
    return IncidentResponse(
        id=inc.id,
        company_id=inc.company_id,
        client_id=inc.client_id,
        client_name=inc.client.name if inc.client else None,
        site_id=inc.site_id,
        site_name=inc.site.name if inc.site else None,
        reported_by_user_id=inc.reported_by_user_id,
        reported_by_name=inc.reported_by.full_name if inc.reported_by else None,
        guard_id=inc.guard_id,
        assignment_id=inc.assignment_id,
        notes=inc.notes,
        latitude=inc.latitude,
        longitude=inc.longitude,
        accuracy=inc.accuracy,
        occurred_at=inc.occurred_at,
        status=inc.status,
        created_at=inc.created_at,
        attachments=[_att_out(a) for a in (inc.attachments or [])],
    )


def create_incident(
    db: Session,
    user: User,
    data: IncidentCreate,
    attachment_paths: Optional[list[tuple[str, Optional[str]]]] = None,
) -> IncidentResponse:
    company = get_company_by_user_id(db, user.id)
    client_id = data.client_id
    if is_client_portal_user(user):
        client_id = user.client_id
    if data.site_id:
        site = db.query(Site).filter(Site.id == data.site_id, Site.company_id == company.id).first()
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        if is_client_portal_user(user) and user.client_id and site.client_id != user.client_id:
            raise HTTPException(status_code=403, detail="Site not assigned to your client")
        if is_client_portal_user(user):
            pinned = pinned_site_ids(db, user)
            if pinned is not None and site.id not in pinned:
                raise HTTPException(status_code=403, detail="Site not assigned to your login")
        if client_id is None:
            client_id = site.client_id
    guard_id = data.guard_id
    if is_staff_portal_user(user) and user.guard_id:
        guard_id = user.guard_id
    assert_owned_by_company(db, Guard, guard_id, company.id, field_name="guard_id")
    assert_owned_by_company(db, Client, client_id, company.id, field_name="client_id")
    if data.assignment_id is not None:
        owns_assignment = (
            db.query(Assignment.id)
            .join(Guard, Assignment.guard_id == Guard.id)
            .filter(Assignment.id == data.assignment_id, Guard.company_id == company.id)
            .first()
        )
        if not owns_assignment:
            raise HTTPException(status_code=422, detail="Invalid assignment_id")
    occurred = data.occurred_at or datetime.now(timezone.utc)
    inc = Incident(
        company_id=company.id,
        client_id=client_id,
        site_id=data.site_id,
        reported_by_user_id=user.id,
        guard_id=guard_id,
        assignment_id=data.assignment_id,
        notes=data.notes.strip(),
        latitude=data.latitude,
        longitude=data.longitude,
        accuracy=data.accuracy,
        occurred_at=occurred,
        status="open",
    )
    db.add(inc)
    db.flush()
    for path, mime in attachment_paths or []:
        db.add(IncidentAttachment(incident_id=inc.id, file_path=path, mime_type=mime))
    db.commit()
    return get_incident(db, user, inc.id)


def list_incidents(
    db: Session,
    user: User,
    *,
    status: Optional[str] = None,
    site_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> list[IncidentResponse]:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(Incident)
        .options(
            joinedload(Incident.client),
            joinedload(Incident.site),
            joinedload(Incident.reported_by),
            joinedload(Incident.attachments),
        )
        .filter(Incident.company_id == company.id)
    )
    if status:
        q = q.filter(Incident.status == status)
    if site_id:
        q = q.filter(Incident.site_id == site_id)
    if is_client_portal_user(user) and user.client_id:
        q = q.filter(Incident.client_id == user.client_id)
        pinned = pinned_site_ids(db, user)
        if pinned is not None:
            q = q.filter(Incident.site_id.in_(pinned))
    if is_staff_portal_user(user):
        if user.guard_id:
            q = q.filter(
                (Incident.reported_by_user_id == user.id) | (Incident.guard_id == user.guard_id)
            )
        else:
            q = q.filter(Incident.reported_by_user_id == user.id)
    if start_date:
        q = q.filter(Incident.occurred_at >= datetime.combine(start_date, time.min))
    if end_date:
        q = q.filter(Incident.occurred_at <= datetime.combine(end_date, time.max))
    rows = q.order_by(Incident.occurred_at.desc()).limit(300).all()
    return [_out(r) for r in rows]


def get_incident(db: Session, user: User, incident_id: int) -> IncidentResponse:
    company = get_company_by_user_id(db, user.id)
    inc = (
        db.query(Incident)
        .options(
            joinedload(Incident.client),
            joinedload(Incident.site),
            joinedload(Incident.reported_by),
            joinedload(Incident.attachments),
        )
        .filter(Incident.id == incident_id, Incident.company_id == company.id)
        .first()
    )
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    if is_client_portal_user(user) and user.client_id and inc.client_id != user.client_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if is_client_portal_user(user):
        pinned = pinned_site_ids(db, user)
        if pinned is not None and inc.site_id not in pinned:
            raise HTTPException(status_code=403, detail="Access denied")
    if is_staff_portal_user(user) and inc.reported_by_user_id != user.id and inc.guard_id != user.guard_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _out(inc)


def update_incident(db: Session, user: User, incident_id: int, data: IncidentUpdate) -> IncidentResponse:
    company = get_company_by_user_id(db, user.id)
    inc = db.query(Incident).filter(Incident.id == incident_id, Incident.company_id == company.id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    if is_client_portal_user(user) or is_staff_portal_user(user):
        # portal users can only append notes / cannot close others' incidents freely
        if is_staff_portal_user(user) and inc.reported_by_user_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        if data.status and data.status not in ("open",):
            raise HTTPException(status_code=403, detail="Insufficient permissions to change status")
    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(inc, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    return get_incident(db, user, incident_id)


def summary_report(
    db: Session,
    user: User,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> list[IncidentSummaryRow]:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(Incident.status, Incident.site_id, func.count(Incident.id))
        .filter(Incident.company_id == company.id)
        .group_by(Incident.status, Incident.site_id)
    )
    if is_client_portal_user(user) and user.client_id:
        q = q.filter(Incident.client_id == user.client_id)
        pinned = pinned_site_ids(db, user)
        if pinned is not None:
            q = q.filter(Incident.site_id.in_(pinned))
    if start_date:
        q = q.filter(Incident.occurred_at >= datetime.combine(start_date, time.min))
    if end_date:
        q = q.filter(Incident.occurred_at <= datetime.combine(end_date, time.max))
    rows = q.all()
    site_ids = {r[1] for r in rows if r[1]}
    sites = {s.id: s.name for s in db.query(Site).filter(Site.id.in_(site_ids)).all()} if site_ids else {}
    return [
        IncidentSummaryRow(status=st, count=cnt, site_id=sid, site_name=sites.get(sid) if sid else None)
        for st, sid, cnt in rows
    ]
