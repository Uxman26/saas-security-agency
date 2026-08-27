from __future__ import annotations

import json
from datetime import date
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import Assignment, Attendance, Guard, ShiftEarlyFinishLog, ShiftLateLog, ShiftOvertimeLog, Site, User
from app.services.company_service import get_company_by_user_id


def _audit_timing_change(
    db: Session,
    company_id: int,
    user_id: int,
    assignment: Assignment,
    *,
    shift_start: Optional[str] = None,
    shift_end: Optional[str] = None,
    reason: str = "",
) -> None:
    """Mirror an overtime / early-finish / lateness edit into the shift history.

    Called before the assignment is mutated, so `before` is still the scheduled shift.
    Only the direct API path comes through here; the planner's own sync writes its
    adjustments via apply_planner_* and is already covered by the planner diff.
    """
    from app.services import shift_audit_service

    before = shift_audit_service.snapshot_from_assignment(assignment)
    after = dict(before)
    if shift_start is not None:
        after["start"] = shift_start
    if shift_end is not None:
        after["end"] = shift_end
    if before == after:
        return
    row = shift_audit_service.log_assignment_event(
        db,
        company_id=company_id,
        user_id=user_id,
        action="shift_time_changed",
        assignment=assignment,
        before=before,
        after=after,
    )
    if reason:
        row.summary = f"{row.summary} · {reason}"


def _parse_mins(t: Optional[str]) -> int:
    if not t:
        return 0
    try:
        parts = str(t).strip().split(":")
        return int(parts[0]) * 60 + (int(parts[1]) if len(parts) > 1 else 0)
    except (ValueError, IndexError):
        return 0


def _mins_to_time(m: int) -> str:
    m = max(0, int(m)) % (24 * 60)
    return f"{m // 60:02d}:{m % 60:02d}"


def _assignment_for_company(db: Session, company_id: int, assignment_id: int, user_id: int) -> Assignment:
    """The assignment, if this caller may adjust it.

    Company scope alone is not enough. Overtime, early finish and lateness are the four
    write paths a portal login can hold without holding rota.edit, and every one of them
    resolves the shift through here — so without the portal filter a guard granted
    rota.log_overtime could rewrite the end time of any colleague's shift in the tenant.
    404 rather than 403, matching authz.owned_or_404.
    """
    from app.services.portal_access import filter_assignments_for_user, is_portal_role

    q = (
        db.query(Assignment)
        .join(Guard)
        .outerjoin(Site)
        .options(joinedload(Assignment.guard), joinedload(Assignment.site))
        .filter(Assignment.id == assignment_id, Guard.company_id == company_id)
    )
    user = db.query(User).filter(User.id == user_id).first()
    if user and is_portal_role(user):
        q = filter_assignments_for_user(db, user, q)
    a = q.first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return a


def _norm_hhmm(t: Optional[str]) -> str:
    """Normalize '9:00' / '09:00:00' → '09:00' for assignment matching."""
    raw = (t or "").strip()
    if not raw:
        return ""
    try:
        parts = raw.split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        return f"{h:02d}:{m:02d}"
    except (ValueError, IndexError):
        return raw


def find_assignment(
    db: Session,
    company_id: int,
    guard_id: int,
    shift_date: date,
    shift_start: str,
    site_name: Optional[str] = None,
) -> Optional[Assignment]:
    want_start = _norm_hhmm(shift_start)
    site_key = " ".join((site_name or "").strip().lower().split())

    rows = (
        db.query(Assignment)
        .join(Guard)
        .outerjoin(Site)
        .options(joinedload(Assignment.site))
        .filter(
            Guard.company_id == company_id,
            Assignment.guard_id == guard_id,
            Assignment.date == shift_date,
        )
        .order_by(Assignment.id.desc())
        .all()
    )
    if not rows:
        return None

    def site_ok(a: Assignment) -> bool:
        if not site_key:
            return True
        name = " ".join(((a.site.name if a.site else "") or "").strip().lower().split())
        return name == site_key

    candidates = [a for a in rows if site_ok(a)] or rows

    for a in candidates:
        if _norm_hhmm(a.shift_start) == want_start:
            return a

    # Late shifts: Assignment.shift_start is the actual (late) start; scheduled is in ShiftLateLog.
    late_hits = (
        db.query(Assignment)
        .join(ShiftLateLog, ShiftLateLog.assignment_id == Assignment.id)
        .join(Guard)
        .options(joinedload(Assignment.site))
        .filter(
            Guard.company_id == company_id,
            Assignment.guard_id == guard_id,
            Assignment.date == shift_date,
        )
        .order_by(Assignment.id.desc())
        .all()
    )
    for a in late_hits:
        if not site_ok(a) and site_key:
            continue
        late = (
            db.query(ShiftLateLog)
            .filter(ShiftLateLog.assignment_id == a.id)
            .order_by(ShiftLateLog.id.desc())
            .first()
        )
        if not late:
            continue
        if _norm_hhmm(late.scheduled_start) == want_start or _norm_hhmm(a.shift_start) == want_start:
            return a

    # Single shift that day (+ matching site when given): accept even if times drifted.
    if len(candidates) == 1:
        return candidates[0]
    return None


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
    a = _assignment_for_company(db, company.id, assignment_id, user_id)
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
    _audit_timing_change(db, company.id, user_id, a, shift_end=new_end, reason=f"Overtime: {reason}")
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
    a = _assignment_for_company(db, company.id, assignment_id, user_id)
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
    _audit_timing_change(db, company.id, user_id, a, shift_end=actual_end, reason=f"Early finish: {reason}")
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


def record_lateness(
    db: Session,
    user_id: int,
    assignment_id: int,
    scheduled_start: str,
    late_minutes: int,
    note: Optional[str] = None,
) -> ShiftLateLog:
    company = get_company_by_user_id(db, user_id)
    scheduled_start = (scheduled_start or "").strip()
    if not scheduled_start:
        raise HTTPException(status_code=400, detail="Scheduled start is required")
    late_minutes = int(late_minutes)
    if late_minutes <= 0:
        raise HTTPException(status_code=400, detail="Late minutes must be greater than zero")
    a = _assignment_for_company(db, company.id, assignment_id, user_id)
    actual_start = _mins_to_time(_parse_mins(scheduled_start) + late_minutes)
    existing = db.query(ShiftLateLog).filter(ShiftLateLog.assignment_id == a.id).first()
    if existing:
        existing.scheduled_start = scheduled_start
        existing.actual_start = actual_start
        existing.late_minutes = late_minutes
        existing.note = (note or "").strip() or None
        existing.recorded_by = user_id
        log = existing
    else:
        log = ShiftLateLog(
            company_id=company.id,
            assignment_id=a.id,
            guard_id=a.guard_id,
            site_id=a.site_id,
            shift_date=a.date,
            scheduled_start=scheduled_start,
            actual_start=actual_start,
            late_minutes=late_minutes,
            note=(note or "").strip() or None,
            recorded_by=user_id,
        )
        db.add(log)
    _audit_timing_change(
        db,
        company.id,
        user_id,
        a,
        shift_start=actual_start,
        reason=f"Late arrival: {late_minutes} min" + (f" · {(note or '').strip()}" if (note or "").strip() else ""),
    )
    a.shift_start = actual_start
    att = db.query(Attendance).filter(Attendance.assignment_id == a.id).first()
    if att:
        att.status = "late"
    db.commit()
    db.refresh(log)
    return log


def record_lateness_by_shift(
    db: Session,
    user_id: int,
    guard_id: int,
    shift_date: date,
    shift_start: str,
    site_name: str,
    late_minutes: int,
    note: Optional[str] = None,
) -> ShiftLateLog:
    company = get_company_by_user_id(db, user_id)
    a = find_assignment(db, company.id, guard_id, shift_date, shift_start, site_name)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found for this shift")
    return record_lateness(db, user_id, a.id, shift_start, late_minutes, note)


def record_lateness_for_assignment(
    db: Session,
    user_id: int,
    assignment_id: int,
    late_minutes: int,
    scheduled_start: Optional[str] = None,
    note: Optional[str] = None,
) -> ShiftLateLog:
    company = get_company_by_user_id(db, user_id)
    a = _assignment_for_company(db, company.id, assignment_id, user_id)
    if not scheduled_start:
        existing = db.query(ShiftLateLog).filter(ShiftLateLog.assignment_id == a.id).first()
        scheduled_start = existing.scheduled_start if existing else (a.shift_start or "")
    return record_lateness(db, user_id, assignment_id, scheduled_start, late_minutes, note)


def apply_planner_lateness(
    db: Session,
    user_id: int,
    company_id: int,
    assignment: Assignment,
    scheduled_start: str,
    late_minutes: int,
    note: Optional[str] = None,
) -> None:
    if late_minutes <= 0:
        return
    scheduled_start = (scheduled_start or "").strip()
    if not scheduled_start:
        return
    actual_start = _mins_to_time(_parse_mins(scheduled_start) + late_minutes)
    existing = db.query(ShiftLateLog).filter(ShiftLateLog.assignment_id == assignment.id).first()
    if existing:
        existing.scheduled_start = scheduled_start
        existing.actual_start = actual_start
        existing.late_minutes = late_minutes
        existing.note = (note or "").strip() or None
        existing.recorded_by = user_id
    else:
        db.add(
            ShiftLateLog(
                company_id=company_id,
                assignment_id=assignment.id,
                guard_id=assignment.guard_id,
                site_id=assignment.site_id,
                shift_date=assignment.date,
                scheduled_start=scheduled_start,
                actual_start=actual_start,
                late_minutes=late_minutes,
                note=(note or "").strip() or None,
                recorded_by=user_id,
            )
        )
    assignment.shift_start = actual_start


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


def sync_published_plan_lateness(db: Session, user_id: int, plan) -> None:
    if plan.status != "published" or not plan.planner_data:
        return
    try:
        data = json.loads(plan.planner_data)
    except (json.JSONDecodeError, TypeError):
        return
    company = get_company_by_user_id(db, user_id)
    attendance = data.get("attendance") or {}
    shifts = data.get("shifts") or {}
    changed = False
    for key, rec in attendance.items():
        if not isinstance(rec, dict) or rec.get("synced"):
            continue
        late_m = int(rec.get("lateMinutes") or 0)
        if late_m <= 0 or rec.get("status") != "late":
            continue
        parts = str(key).split(":")
        if len(parts) < 3:
            continue
        emp_id, dk, si = parts[0], parts[1], parts[2]
        try:
            guard_id = int(emp_id)
            idx = int(si)
        except (TypeError, ValueError):
            continue
        day_shifts = (shifts.get(emp_id) or {}).get(dk) or []
        if idx >= len(day_shifts):
            continue
        sh = day_shifts[idx]
        scheduled = sh.get("scheduledStart") or sh.get("start") or ""
        a = find_assignment(
            db,
            company.id,
            guard_id,
            date.fromisoformat(dk),
            scheduled,
            sh.get("site") or "",
        )
        if not a:
            continue
        apply_planner_lateness(db, user_id, company.id, a, scheduled, late_m, rec.get("note"))
        rec["synced"] = True
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


def lateness_report_rows(
    db: Session,
    user_id: int,
    start_date: date,
    end_date: date,
    guard_id: Optional[int] = None,
) -> List[dict]:
    company = get_company_by_user_id(db, user_id)
    q = (
        db.query(ShiftLateLog)
        .options(joinedload(ShiftLateLog.guard), joinedload(ShiftLateLog.site), joinedload(ShiftLateLog.recorder))
        .filter(
            ShiftLateLog.company_id == company.id,
            ShiftLateLog.shift_date >= start_date,
            ShiftLateLog.shift_date <= end_date,
        )
        .order_by(ShiftLateLog.shift_date.desc(), ShiftLateLog.id.desc())
    )
    if guard_id:
        q = q.filter(ShiftLateLog.guard_id == guard_id)
    rows = []
    for log in q.all():
        rows.append(
            {
                "date": log.shift_date.isoformat(),
                "guard": log.guard.full_name if log.guard else "",
                "site": log.site.name if log.site else "",
                "scheduled_start": log.scheduled_start,
                "actual_start": log.actual_start,
                "late_minutes": log.late_minutes,
                "note": log.note or "",
                "recorded_by": _recorder_name(log.recorder),
                "recorded_at": log.created_at.isoformat() if log.created_at else "",
            }
        )
    return rows
