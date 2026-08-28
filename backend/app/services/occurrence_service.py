"""Daily Occurrences Sheet — the shift log a guard fills in through the day.

A sheet is edited as one document: the header plus its numbered lines are saved
together, and a write that includes ``entries`` replaces the whole line set. That
matches how the paper sheet works and avoids per-row endpoints for something that is
only ever read and written as a page.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import Guard, OccurrenceEntry, OccurrenceSheet, Site, User
from app.schemas import (
    OccurrenceEntryIn,
    OccurrenceSheetCreate,
    OccurrenceSheetResponse,
    OccurrenceSheetUpdate,
)
from app.services.company_service import get_company_by_user_id
from app.services.portal_access import (
    filter_sites_for_user,
    is_client_portal_user,
    is_staff_portal_user,
    pinned_site_ids,
)

STATUSES = ("open", "submitted", "closed")
MAX_ENTRIES = 60


def _reference(db: Session, company_id: int, when: date) -> str:
    prefix = f"DOS-{when.year}-"
    count = (
        db.query(func.count(OccurrenceSheet.id))
        .filter(OccurrenceSheet.company_id == company_id, OccurrenceSheet.reference.like(f"{prefix}%"))
        .scalar()
        or 0
    )
    seq = count + 1
    ref = f"{prefix}{seq:04d}"
    while (
        db.query(OccurrenceSheet.id)
        .filter(OccurrenceSheet.company_id == company_id, OccurrenceSheet.reference == ref)
        .first()
    ):
        seq += 1
        ref = f"{prefix}{seq:04d}"
    return ref


def _out(row: OccurrenceSheet) -> OccurrenceSheetResponse:
    data = OccurrenceSheetResponse.model_validate(row)
    return data.model_copy(
        update={
            "site_name": row.site.name if row.site else None,
            "guard_name": row.guard.full_name if row.guard else None,
            "created_by_name": row.created_by.full_name if row.created_by else None,
            "entry_count": len(row.entries or []),
        }
    )


def _scope(db: Session, user: User, q):
    if is_staff_portal_user(user):
        # A guard sees the sheets they filed, not the site's whole history.
        return q.filter(OccurrenceSheet.created_by_user_id == user.id)
    if is_client_portal_user(user):
        allowed = {
            r[0]
            for r in filter_sites_for_user(
                db, user, db.query(Site.id).filter(Site.company_id == user.company_id)
            ).all()
        }
        return q.filter(OccurrenceSheet.site_id.in_(allowed or {0}))
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


def _replace_entries(db: Session, sheet: OccurrenceSheet, entries: list[OccurrenceEntryIn]) -> None:
    if len(entries) > MAX_ENTRIES:
        raise HTTPException(status_code=422, detail=f"A sheet holds at most {MAX_ENTRIES} lines")
    for old in list(sheet.entries or []):
        db.delete(old)
    sheet.entries = []
    db.flush()
    serial = 1
    for item in entries:
        # Skip entirely blank lines so an untouched row on screen is not stored.
        if not any(
            (getattr(item, f) or "").strip()
            for f in ("start_time", "finish_time", "occurrence", "action_taken")
        ):
            continue
        db.add(
            OccurrenceEntry(
                sheet_id=sheet.id,
                serial_no=item.serial_no or serial,
                start_time=item.start_time,
                finish_time=item.finish_time,
                occurrence=item.occurrence,
                action_taken=item.action_taken,
            )
        )
        serial += 1


def _base(db: Session, company_id: int):
    return (
        db.query(OccurrenceSheet)
        .options(
            joinedload(OccurrenceSheet.site),
            joinedload(OccurrenceSheet.guard),
            joinedload(OccurrenceSheet.created_by),
            joinedload(OccurrenceSheet.entries),
        )
        .filter(OccurrenceSheet.company_id == company_id)
    )


def create_sheet(db: Session, user: User, data: OccurrenceSheetCreate) -> OccurrenceSheetResponse:
    company = get_company_by_user_id(db, user.id)
    site = _resolve_site(db, user, company.id, data.site_id)
    guard_id = data.guard_id
    if is_staff_portal_user(user) and user.guard_id:
        guard_id = user.guard_id
    if guard_id is not None:
        if not db.query(Guard.id).filter(Guard.id == guard_id, Guard.company_id == company.id).first():
            raise HTTPException(status_code=404, detail="Employee not found")

    payload = data.model_dump(exclude={"entries", "site_id", "guard_id"})
    sheet = OccurrenceSheet(
        company_id=company.id,
        site_id=site.id if site else None,
        client_id=site.client_id if site else None,
        guard_id=guard_id,
        created_by_user_id=user.id,
        reference=_reference(db, company.id, data.sheet_date),
        status="open",
        **payload,
    )
    db.add(sheet)
    db.flush()
    _replace_entries(db, sheet, data.entries or [])
    db.commit()
    db.refresh(sheet)
    return get_sheet(db, user, sheet.id)


def list_sheets(
    db: Session,
    user: User,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    site_id: Optional[int] = None,
    status: Optional[str] = None,
) -> list[OccurrenceSheetResponse]:
    company = get_company_by_user_id(db, user.id)
    q = _scope(db, user, _base(db, company.id))
    if site_id:
        q = q.filter(OccurrenceSheet.site_id == site_id)
    if status:
        q = q.filter(OccurrenceSheet.status == status)
    if start_date:
        q = q.filter(OccurrenceSheet.sheet_date >= start_date)
    if end_date:
        q = q.filter(OccurrenceSheet.sheet_date <= end_date)
    rows = q.order_by(OccurrenceSheet.sheet_date.desc(), OccurrenceSheet.id.desc()).limit(500).all()
    return [_out(r) for r in rows]


def get_sheet(db: Session, user: User, sheet_id: int) -> OccurrenceSheetResponse:
    company = get_company_by_user_id(db, user.id)
    row = _scope(db, user, _base(db, company.id).filter(OccurrenceSheet.id == sheet_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Occurrence sheet not found")
    return _out(row)


def _row_for_write(db: Session, user: User, company_id: int, sheet_id: int) -> OccurrenceSheet:
    q = (
        db.query(OccurrenceSheet)
        .options(joinedload(OccurrenceSheet.entries))
        .filter(OccurrenceSheet.id == sheet_id, OccurrenceSheet.company_id == company_id)
    )
    row = _scope(db, user, q).first()
    if not row:
        raise HTTPException(status_code=404, detail="Occurrence sheet not found")
    return row


def update_sheet(
    db: Session, user: User, sheet_id: int, data: OccurrenceSheetUpdate
) -> OccurrenceSheetResponse:
    company = get_company_by_user_id(db, user.id)
    row = _row_for_write(db, user, company.id, sheet_id)
    payload = data.model_dump(exclude_unset=True)
    entries = payload.pop("entries", None)

    if "status" in payload:
        if payload["status"] not in STATUSES:
            raise HTTPException(status_code=422, detail=f"status must be one of {', '.join(STATUSES)}")
        if is_client_portal_user(user):
            raise HTTPException(status_code=403, detail="Insufficient permissions to change status")
    if "site_id" in payload:
        site = _resolve_site(db, user, company.id, payload["site_id"])
        row.client_id = site.client_id if site else None

    for key, value in payload.items():
        setattr(row, key, value.strip() if isinstance(value, str) else value)
    if entries is not None:
        _replace_entries(db, row, [OccurrenceEntryIn(**e) for e in entries])
    db.commit()
    return get_sheet(db, user, sheet_id)


def delete_sheet(db: Session, user: User, sheet_id: int) -> None:
    company = get_company_by_user_id(db, user.id)
    row = _row_for_write(db, user, company.id, sheet_id)
    db.delete(row)
    db.commit()
