"""Accident Report Log — the digital form behind X-FORM-077.

Kept separate from incidents on purpose. An incident is an operational event a guard
logs during a shift and is counted in the monthly summary; an accident report is an
HSE-facing record about a person being hurt, with its own supervisor sign-off, SIA
number and emergency-services timings. Merging them would force every incident to carry
twenty accident fields it never uses.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import AccidentReport, Client, Guard, Site, User
from app.schemas import AccidentReportCreate, AccidentReportResponse, AccidentReportUpdate
from app.services.company_service import get_company_by_user_id
from app.services.portal_access import (
    is_client_portal_user,
    is_staff_portal_user,
    pinned_site_ids,
)

STATUSES = ("open", "under_review", "closed")


def _reference(db: Session, company_id: int, when: date) -> str:
    """ACC-<year>-<sequence>, unique per company per year."""
    year = when.year
    prefix = f"ACC-{year}-"
    count = (
        db.query(func.count(AccidentReport.id))
        .filter(
            AccidentReport.company_id == company_id,
            AccidentReport.reference.like(f"{prefix}%"),
        )
        .scalar()
        or 0
    )
    seq = count + 1
    ref = f"{prefix}{seq:04d}"
    # A deleted row leaves a gap, so step past any collision rather than reusing an id.
    while (
        db.query(AccidentReport.id)
        .filter(AccidentReport.company_id == company_id, AccidentReport.reference == ref)
        .first()
    ):
        seq += 1
        ref = f"{prefix}{seq:04d}"
    return ref


def _out(row: AccidentReport) -> AccidentReportResponse:
    data = AccidentReportResponse.model_validate(row)
    return data.model_copy(
        update={
            "site_name": row.site.name if row.site else None,
            "guard_name": row.guard.full_name if row.guard else None,
            "created_by_name": row.created_by.full_name if row.created_by else None,
        }
    )


def _scope(db: Session, user: User, q):
    """Narrow to what this login may see. Mirrors incident_service."""
    if is_client_portal_user(user) and user.client_id:
        q = q.filter(AccidentReport.client_id == user.client_id)
        pinned = pinned_site_ids(db, user)
        if pinned is not None:
            q = q.filter(AccidentReport.site_id.in_(pinned))
    if is_staff_portal_user(user):
        q = q.filter(AccidentReport.created_by_user_id == user.id)
    return q


def _resolve_site(db: Session, user: User, company_id: int, site_id: Optional[int]):
    if site_id is None:
        return None
    site = db.query(Site).filter(Site.id == site_id, Site.company_id == company_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if is_client_portal_user(user):
        if user.client_id and site.client_id != user.client_id:
            raise HTTPException(status_code=403, detail="Site not assigned to your client")
        pinned = pinned_site_ids(db, user)
        if pinned is not None and site.id not in pinned:
            raise HTTPException(status_code=403, detail="Site not assigned to your login")
    return site


def create_report(db: Session, user: User, data: AccidentReportCreate) -> AccidentReportResponse:
    company = get_company_by_user_id(db, user.id)
    site = _resolve_site(db, user, company.id, data.site_id)
    guard_id = data.guard_id
    if is_staff_portal_user(user) and user.guard_id:
        # A guard filing their own report cannot attribute it to someone else.
        guard_id = user.guard_id
    if guard_id is not None:
        owned = db.query(Guard.id).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
        if not owned:
            raise HTTPException(status_code=404, detail="Employee not found")

    payload = data.model_dump()
    payload.pop("site_id", None)
    payload.pop("guard_id", None)
    row = AccidentReport(
        company_id=company.id,
        site_id=site.id if site else None,
        client_id=site.client_id if site else None,
        guard_id=guard_id,
        created_by_user_id=user.id,
        reference=_reference(db, company.id, data.report_date),
        status="open",
        **payload,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return get_report(db, user, row.id)


def list_reports(
    db: Session,
    user: User,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    site_id: Optional[int] = None,
    status: Optional[str] = None,
) -> list[AccidentReportResponse]:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(AccidentReport)
        .options(
            joinedload(AccidentReport.site),
            joinedload(AccidentReport.guard),
            joinedload(AccidentReport.created_by),
        )
        .filter(AccidentReport.company_id == company.id)
    )
    q = _scope(db, user, q)
    if site_id:
        q = q.filter(AccidentReport.site_id == site_id)
    if status:
        q = q.filter(AccidentReport.status == status)
    if start_date:
        q = q.filter(AccidentReport.report_date >= start_date)
    if end_date:
        q = q.filter(AccidentReport.report_date <= end_date)
    rows = q.order_by(AccidentReport.report_date.desc(), AccidentReport.id.desc()).limit(500).all()
    return [_out(r) for r in rows]


def get_report(db: Session, user: User, report_id: int) -> AccidentReportResponse:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(AccidentReport)
        .options(
            joinedload(AccidentReport.site),
            joinedload(AccidentReport.guard),
            joinedload(AccidentReport.created_by),
        )
        .filter(AccidentReport.id == report_id, AccidentReport.company_id == company.id)
    )
    row = _scope(db, user, q).first()
    if not row:
        raise HTTPException(status_code=404, detail="Accident report not found")
    return _out(row)


def _row_for_write(db: Session, user: User, company_id: int, report_id: int) -> AccidentReport:
    q = db.query(AccidentReport).filter(
        AccidentReport.id == report_id, AccidentReport.company_id == company_id
    )
    row = _scope(db, user, q).first()
    if not row:
        raise HTTPException(status_code=404, detail="Accident report not found")
    return row


def update_report(
    db: Session, user: User, report_id: int, data: AccidentReportUpdate
) -> AccidentReportResponse:
    company = get_company_by_user_id(db, user.id)
    row = _row_for_write(db, user, company.id, report_id)
    payload = data.model_dump(exclude_unset=True)

    if "status" in payload:
        if payload["status"] not in STATUSES:
            raise HTTPException(status_code=422, detail=f"status must be one of {', '.join(STATUSES)}")
        if is_staff_portal_user(user) or is_client_portal_user(user):
            raise HTTPException(status_code=403, detail="Insufficient permissions to change status")
    if "site_id" in payload:
        site = _resolve_site(db, user, company.id, payload["site_id"])
        row.client_id = site.client_id if site else None
    if payload.get("guard_id") is not None:
        owned = (
            db.query(Guard.id)
            .filter(Guard.id == payload["guard_id"], Guard.company_id == company.id)
            .first()
        )
        if not owned:
            raise HTTPException(status_code=404, detail="Employee not found")

    for key, value in payload.items():
        setattr(row, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    return get_report(db, user, report_id)


def delete_report(db: Session, user: User, report_id: int) -> None:
    company = get_company_by_user_id(db, user.id)
    row = _row_for_write(db, user, company.id, report_id)
    db.delete(row)
    db.commit()
