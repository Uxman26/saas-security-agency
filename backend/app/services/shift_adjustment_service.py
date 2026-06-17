from __future__ import annotations

import json
from datetime import date
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import Assignment, Guard, ShiftEarlyFinishLog, ShiftOvertimeLog, Site, User
from app.services.company_service import get_company_by_user_id


def _parse_mins(t: Optional[str]) -> int:
    if not t:
        return 0
    try:
        parts = str(t).strip().split(":")
        return int(parts[0]) * 60 + (int(parts[1]) if len(parts) > 1 else 0)
    except (ValueError, IndexError):
        return 0


def _assignment_for_company(db: Session, company_id: int, assignment_id: int) -> Assignment:
    a = (
        db.query(Assignment)
        .join(Guard)
        .options(joinedload(Assignment.guard), joinedload(Assignment.site))
        .filter(Assignment.id == assignment_id, Guard.company_id == company_id)
        .first()
    )
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return a


def find_assignment(
    db: Session,
    company_id: int,
    guard_id: int,
    shift_date: date,
    shift_start: str,
    site_name: Optional[str] = None,
) -> Optional[Assignment]:
    q = (
        db.query(Assignment)
        .join(Guard)
        .join(Site)
        .filter(
            Guard.company_id == company_id,
            Assignment.guard_id == guard_id,
            Assignment.date == shift_date,
            Assignment.shift_start == shift_start,
        )
    )
    if site_name:
        q = q.filter(Site.name == site_name)
    return q.order_by(Assignment.id.desc()).first()


def record_overtime(
    db: Session,
    user_id: int,
    assignment_id: int,
    new_end: str,
    reason: str,
) -> ShiftOvertimeLog:
    company = get_company_by_user_id(db, user_id)
    reason = (reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reason is required")
    new_end = (new_end or "").strip()
    if not new_end:
        raise HTTPException(status_code=400, detail="New end time is required")
    a = _assignment_for_company(db, company.id, assignment_id)
    scheduled = a.shift_end or ""
    if _parse_mins(new_end) <= _parse_mins(scheduled):
        raise HTTPException(status_code=400, detail="New end time must be after scheduled end")
    log = ShiftOvertimeLog(
        company_id=company.id,
        assignment_id=a.id,
        guard_id=a.guard_id,
        site_id=a.site_id,
        shift_date=a.date,
        shift_start=a.shift_start,
        scheduled_end=scheduled,
        new_end=new_end,
        reason=reason,
        recorded_by=user_id,
    )
    a.shift_end = new_end
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def record_overtime_by_shift(
    db: Session,
    user_id: int,
    guard_id: int,
    shift_date: date,
    shift_start: str,
    site_name: str,
    new_end: str,
    reason: str,
) -> ShiftOvertimeLog:
    company = get_company_by_user_id(db, user_id)
    a = find_assignment(db, company.id, guard_id, shift_date, shift_start, site_name)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found for this shift")
    return record_overtime(db, user_id, a.id, new_end, reason)


def record_early_finish(
    db: Session,
    user_id: int,
    assignment_id: int,
    actual_end: str,
    reason: str,
) -> ShiftEarlyFinishLog:
    company = get_company_by_user_id(db, user_id)
    reason = (reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reason is required")
    actual_end = (actual_end or "").strip()
    if not actual_end:
        raise HTTPException(status_code=400, detail="Actual end time is required")
    a = _assignment_for_company(db, company.id, assignment_id)
    scheduled = a.shift_end or ""
    if _parse_mins(actual_end) >= _parse_mins(scheduled):
        raise HTTPException(status_code=400, detail="Actual end time must be before scheduled end")
    log = ShiftEarlyFinishLog(
        company_id=company.id,
        assignment_id=a.id,
        guard_id=a.guard_id,
        site_id=a.site_id,
        shift_date=a.date,
        shift_start=a.shift_start,
        scheduled_end=scheduled,
        actual_end=actual_end,
        reason=reason,
        recorded_by=user_id,
    )
    a.shift_end = actual_end
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def record_early_finish_by_shift(
    db: Session,
    user_id: int,
    guard_id: int,
    shift_date: date,
    shift_start: str,
    site_name: str,
    actual_end: str,
    reason: str,
) -> ShiftEarlyFinishLog:
    company = get_company_by_user_id(db, user_id)
    a = find_assignment(db, company.id, guard_id, shift_date, shift_start, site_name)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found for this shift")
    return record_early_finish(db, user_id, a.id, actual_end, reason)


def apply_planner_adjustments(db: Session, user_id: int, company_id: int, assignment: Assignment, adjustments: list) -> None:
    if not adjustments:
        return
    for adj in adjustments:
        if not isinstance(adj, dict) or adj.get("synced"):
            continue
        kind = adj.get("type")
        reason = (adj.get("reason") or "").strip()
        if not reason:
            continue
        scheduled = adj.get("scheduledEnd") or assignment.shift_end or ""
        if kind == "overtime":
            new_end = (adj.get("actualEnd") or "").strip()
            if not new_end or _parse_mins(new_end) <= _parse_mins(scheduled):
                continue
            db.add(
                ShiftOvertimeLog(
                    company_id=company_id,
                    assignment_id=assignment.id,
                    guard_id=assignment.guard_id,
                    site_id=assignment.site_id,
                    shift_date=assignment.date,
                    shift_start=assignment.shift_start,
                    scheduled_end=scheduled,
                    new_end=new_end,
                    reason=reason,
                    recorded_by=user_id,
                )
            )
            assignment.shift_end = new_end
        elif kind == "early_finish":
            actual_end = (adj.get("actualEnd") or "").strip()
            if not actual_end or _parse_mins(actual_end) >= _parse_mins(scheduled):
                continue
            db.add(
                ShiftEarlyFinishLog(
                    company_id=company_id,
                    assignment_id=assignment.id,
                    guard_id=assignment.guard_id,
                    site_id=assignment.site_id,
                    shift_date=assignment.date,
                    shift_start=assignment.shift_start,
                    scheduled_end=scheduled,
                    actual_end=actual_end,
                    reason=reason,
                    recorded_by=user_id,
                )
            )
            assignment.shift_end = actual_end


def sync_published_plan_adjustments(db: Session, user_id: int, plan) -> None:
    if plan.status != "published" or not plan.planner_data:
        return
    try:
        data = json.loads(plan.planner_data)
    except (json.JSONDecodeError, TypeError):
        return
    company = get_company_by_user_id(db, user_id)
    shifts = data.get("shifts") or {}
    changed = False
    for emp_id, by_d in shifts.items():
        try:
            guard_id = int(emp_id)
        except (TypeError, ValueError):
            continue
        for dk, day_shifts in (by_d or {}).items():
            for sh in day_shifts or []:
                adjs = [a for a in (sh.get("adjustments") or []) if isinstance(a, dict) and not a.get("synced")]
                if not adjs:
                    continue
                a = find_assignment(
                    db,
                    company.id,
                    guard_id,
                    date.fromisoformat(dk),
                    sh.get("start") or "",
                    sh.get("site") or "",
                )
                if not a:
                    continue
                apply_planner_adjustments(db, user_id, company.id, a, adjs)
                for adj in adjs:
                    adj["synced"] = True
                changed = True
    if changed:
        plan.planner_data = json.dumps(data)
        db.commit()


def _recorder_name(u: Optional[User]) -> str:
    if not u:
        return ""
    return u.full_name or u.email or ""


def overtime_report_rows(
    db: Session,
    user_id: int,
    start_date: date,
    end_date: date,
    guard_id: Optional[int] = None,
) -> List[dict]:
    company = get_company_by_user_id(db, user_id)
    q = (
        db.query(ShiftOvertimeLog)
        .options(joinedload(ShiftOvertimeLog.guard), joinedload(ShiftOvertimeLog.site), joinedload(ShiftOvertimeLog.recorder))
        .filter(
            ShiftOvertimeLog.company_id == company.id,
            ShiftOvertimeLog.shift_date >= start_date,
            ShiftOvertimeLog.shift_date <= end_date,
        )
        .order_by(ShiftOvertimeLog.shift_date.desc(), ShiftOvertimeLog.id.desc())
    )
    if guard_id:
        q = q.filter(ShiftOvertimeLog.guard_id == guard_id)
    rows = []
    for log in q.all():
        extra = max(0, _parse_mins(log.new_end) - _parse_mins(log.scheduled_end))
        rows.append(
            {
                "date": log.shift_date.isoformat(),
                "guard": log.guard.full_name if log.guard else "",
                "site": log.site.name if log.site else "",
                "shift_start": log.shift_start or "",
                "scheduled_end": log.scheduled_end,
                "new_end": log.new_end,
                "extra_minutes": extra,
                "reason": log.reason,
                "recorded_by": _recorder_name(log.recorder),
                "recorded_at": log.created_at.isoformat() if log.created_at else "",
            }
        )
    return rows


def early_finish_report_rows(
    db: Session,
    user_id: int,
    start_date: date,
    end_date: date,
    guard_id: Optional[int] = None,
) -> List[dict]:
    company = get_company_by_user_id(db, user_id)
    q = (
        db.query(ShiftEarlyFinishLog)
        .options(joinedload(ShiftEarlyFinishLog.guard), joinedload(ShiftEarlyFinishLog.site), joinedload(ShiftEarlyFinishLog.recorder))
        .filter(
            ShiftEarlyFinishLog.company_id == company.id,
            ShiftEarlyFinishLog.shift_date >= start_date,
            ShiftEarlyFinishLog.shift_date <= end_date,
        )
        .order_by(ShiftEarlyFinishLog.shift_date.desc(), ShiftEarlyFinishLog.id.desc())
    )
    if guard_id:
        q = q.filter(ShiftEarlyFinishLog.guard_id == guard_id)
    rows = []
    for log in q.all():
        early = max(0, _parse_mins(log.scheduled_end) - _parse_mins(log.actual_end))
        rows.append(
            {
                "date": log.shift_date.isoformat(),
                "guard": log.guard.full_name if log.guard else "",
                "site": log.site.name if log.site else "",
                "shift_start": log.shift_start or "",
                "scheduled_end": log.scheduled_end,
                "actual_end": log.actual_end,
                "early_minutes": early,
                "reason": log.reason,
                "recorded_by": _recorder_name(log.recorder),
                "recorded_at": log.created_at.isoformat() if log.created_at else "",
            }
        )
    return rows
