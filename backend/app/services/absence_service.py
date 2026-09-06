"""Absence: annual leave, sickness, lateness and anything else that keeps someone away.

Everything is measured in **hours**, because the rest of the system already is —
contracted hours, rota shifts, payroll — and a half-day booked against a 12-hour shift
does not reconcile if it is stored as "0.5 days".

Entitlement comes off the staff record (``leave_entitlement_hrs``/``mins``, with
``leave_allowance_*`` as the older field name), and the leave year runs from the
employee's own ``leave_year_start_day``/``month`` rather than a company-wide date, so
someone on a different anniversary still gets the right remaining balance.

Only **approved** absence counts against a balance. Pending sits in the totals the
calendar shows but not in what has been taken, and declined counts for nothing.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import ABSENCE_KINDS, ABSENCE_STATUSES, AbsenceRecord, Guard
from app.services import audit_service
from app.services.company_service import get_company_by_user_id


def _guard(db: Session, guard_id: int, company_id: int) -> Guard:
    row = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Employee not found")
    return row


def normalize_kind(kind: Optional[str]) -> str:
    k = (kind or "").strip().lower().replace(" ", "_").replace("-", "_")
    if k in ("annual", "leave", "holiday"):
        k = "annual_leave"
    if k not in ABSENCE_KINDS:
        raise HTTPException(
            status_code=400, detail=f"kind must be one of {', '.join(ABSENCE_KINDS)}"
        )
    return k


def normalize_status(status: Optional[str]) -> str:
    s = (status or "approved").strip().lower()
    if s not in ABSENCE_STATUSES:
        raise HTTPException(
            status_code=400, detail=f"status must be one of {', '.join(ABSENCE_STATUSES)}"
        )
    return s


def _hours_from(guard: Guard, start: date, end: date, hours: Optional[float]) -> float:
    """Use the hours given; otherwise bill the employee's average working day per day.

    Falling back to the average day is what makes "book Mon–Fri" work without asking for
    a number, and it uses the employee's own average rather than a fixed 8 so part-timers
    are not over-deducted.
    """
    if hours is not None:
        return max(0.0, float(hours))
    per_day = float(guard.average_day_hrs or 0) + float(guard.average_day_mins or 0) / 60.0
    if per_day <= 0:
        weekly = float(guard.weekly_contracted_hours or 0)
        per_day = weekly / 5.0 if weekly > 0 else 8.0
    days = (end - start).days + 1
    return max(0.0, per_day * max(1, days))


def leave_year_bounds(guard: Guard, on: Optional[date] = None) -> tuple[date, date]:
    """The leave year containing ``on`` for this employee."""
    today = on or date.today()
    day = int(guard.leave_year_start_day or 1)
    month = int(guard.leave_year_start_month or 1)
    day = min(max(day, 1), 28)
    month = min(max(month, 1), 12)
    start = date(today.year, month, day)
    if today < start:
        start = date(today.year - 1, month, day)
    end = date(start.year + 1, month, day) - timedelta(days=1)
    return start, end


def entitlement_hours(guard: Guard) -> float:
    """Annual leave entitlement in hours, tolerating either of the two stored spellings."""
    hrs = guard.leave_entitlement_hrs
    mins = guard.leave_entitlement_mins
    if not hrs and not mins:
        hrs, mins = guard.leave_allowance_hrs, guard.leave_allowance_mins
    return float(hrs or 0) + float(mins or 0) / 60.0


def sickness_entitlement_hours(guard: Guard) -> float:
    return float(guard.sickness_entitlement_hrs or 0) + float(guard.sickness_entitlement_mins or 0) / 60.0


def _query(db: Session, company_id: int, guard_id: Optional[int] = None):
    q = db.query(AbsenceRecord).filter(AbsenceRecord.company_id == company_id)
    if guard_id:
        q = q.filter(AbsenceRecord.guard_id == guard_id)
    return q


def list_absences(
    db: Session,
    user_id: int,
    guard_id: Optional[int] = None,
    kind: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    status: Optional[str] = None,
) -> List[AbsenceRecord]:
    """Absences overlapping the window, newest first.

    The window is an *overlap* test, not containment: an absence running from December
    into January belongs to both years' views rather than falling out of each.
    """
    company = get_company_by_user_id(db, user_id)
    q = _query(db, company.id, guard_id)
    if kind:
        q = q.filter(AbsenceRecord.kind == normalize_kind(kind))
    if status:
        q = q.filter(AbsenceRecord.status == normalize_status(status))
    if start_date:
        q = q.filter(AbsenceRecord.end_date >= start_date)
    if end_date:
        q = q.filter(AbsenceRecord.start_date <= end_date)
    return q.order_by(AbsenceRecord.start_date.desc(), AbsenceRecord.id.desc()).all()


def create_absence(db: Session, user_id: int, data: dict) -> AbsenceRecord:
    company = get_company_by_user_id(db, user_id)
    guard = _guard(db, int(data["guard_id"]), company.id)
    kind = normalize_kind(data.get("kind"))
    start = data["start_date"]
    end = data.get("end_date") or start
    if end < start:
        raise HTTPException(status_code=400, detail="End date cannot be before start date")
    row = AbsenceRecord(
        company_id=company.id,
        guard_id=guard.id,
        kind=kind,
        start_date=start,
        end_date=end,
        start_time=(data.get("start_time") or None),
        end_time=(data.get("end_time") or None),
        hours=_hours_from(guard, start, end, data.get("hours")),
        status=normalize_status(data.get("status")),
        reason=(data.get("reason") or None),
        notes=(data.get("notes") or None),
        created_by_user_id=user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="absence_created",
        entity_type="absence",
        entity_id=row.id,
        meta={"guard_id": guard.id, "kind": kind, "hours": row.hours},
    )
    db.commit()
    return row


def get_absence(db: Session, user_id: int, absence_id: int) -> AbsenceRecord:
    company = get_company_by_user_id(db, user_id)
    row = (
        db.query(AbsenceRecord)
        .filter(AbsenceRecord.id == absence_id, AbsenceRecord.company_id == company.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Absence not found")
    return row


def update_absence(db: Session, user_id: int, absence_id: int, data: dict) -> AbsenceRecord:
    company = get_company_by_user_id(db, user_id)
    row = get_absence(db, user_id, absence_id)
    guard = _guard(db, row.guard_id, company.id)
    if "kind" in data and data["kind"] is not None:
        row.kind = normalize_kind(data["kind"])
    if "status" in data and data["status"] is not None:
        row.status = normalize_status(data["status"])
    if data.get("start_date"):
        row.start_date = data["start_date"]
    if data.get("end_date"):
        row.end_date = data["end_date"]
    if row.end_date < row.start_date:
        raise HTTPException(status_code=400, detail="End date cannot be before start date")
    for field in ("start_time", "end_time", "reason", "notes"):
        if field in data:
            setattr(row, field, data[field] or None)
    if "hours" in data and data["hours"] is not None:
        row.hours = max(0.0, float(data["hours"]))
    elif data.get("start_date") or data.get("end_date"):
        # The span moved and no explicit hours came with it, so re-derive them rather
        # than leaving a five-day booking still costing one day.
        row.hours = _hours_from(guard, row.start_date, row.end_date, None)
    db.commit()
    db.refresh(row)
    return row


def delete_absence(db: Session, user_id: int, absence_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    row = get_absence(db, user_id, absence_id)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="absence_deleted",
        entity_type="absence",
        entity_id=absence_id,
        meta={"guard_id": row.guard_id, "kind": row.kind},
    )
    db.delete(row)
    db.commit()


def absence_summary(
    db: Session,
    user_id: int,
    guard_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict:
    """The four cards at the top of the Absence tab.

    Annual leave is the only one with a remaining figure, because it is the only one with
    an entitlement everybody has. Sickness shows remaining only when an entitlement has
    actually been set, so a company that does not track it sees a total and nothing
    misleading beside it.
    """
    company = get_company_by_user_id(db, user_id)
    guard = _guard(db, guard_id, company.id)
    if not start_date or not end_date:
        start_date, end_date = leave_year_bounds(guard)

    rows = (
        _query(db, company.id, guard_id)
        .filter(AbsenceRecord.end_date >= start_date, AbsenceRecord.start_date <= end_date)
        .all()
    )

    def totals(kind: str) -> tuple[float, int, float, int]:
        taken = sum(r.hours or 0 for r in rows if r.kind == kind and r.status == "approved")
        count = sum(1 for r in rows if r.kind == kind and r.status == "approved")
        pending = sum(r.hours or 0 for r in rows if r.kind == kind and r.status == "pending")
        pending_count = sum(1 for r in rows if r.kind == kind and r.status == "pending")
        return round(taken, 2), count, round(pending, 2), pending_count

    al_taken, al_count, al_pending, al_pending_count = totals("annual_leave")
    sick_taken, sick_count, sick_pending, sick_pending_count = totals("sickness")
    late_taken, late_count, late_pending, late_pending_count = totals("lateness")
    other_taken, other_count, other_pending, other_pending_count = totals("other")

    entitlement = entitlement_hours(guard)
    sick_entitlement = sickness_entitlement_hours(guard)

    return {
        "guard_id": guard.id,
        "guard_name": guard.full_name,
        "period_start": start_date,
        "period_end": end_date,
        "annual_leave": {
            "kind": "annual_leave",
            "entitlement_hours": round(entitlement, 2),
            "taken_hours": al_taken,
            "remaining_hours": round(entitlement - al_taken, 2) if entitlement else None,
            "pending_hours": al_pending,
            "logged": al_count,
            "pending_count": al_pending_count,
        },
        "sickness": {
            "kind": "sickness",
            "entitlement_hours": round(sick_entitlement, 2) if sick_entitlement else None,
            "taken_hours": sick_taken,
            "remaining_hours": round(sick_entitlement - sick_taken, 2) if sick_entitlement else None,
            "pending_hours": sick_pending,
            "logged": sick_count,
            "pending_count": sick_pending_count,
        },
        "lateness": {
            "kind": "lateness",
            "entitlement_hours": None,
            "taken_hours": late_taken,
            "remaining_hours": None,
            "pending_hours": late_pending,
            "logged": late_count,
            "pending_count": late_pending_count,
        },
        "other": {
            "kind": "other",
            "entitlement_hours": None,
            "taken_hours": other_taken,
            "remaining_hours": None,
            "pending_hours": other_pending,
            "logged": other_count,
            "pending_count": other_pending_count,
        },
    }
