from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Assignment, PatrolRoute, User
from app.schemas import OpsEligibilityResponse
from app.services.attendance_service import _assignment_shift_end_dt, _company_zone
from app.services.company_service import get_company_by_user_id
from app.services.lone_worker_service import resolve_policy
from app.services.portal_access import get_linked_guard, is_staff_portal_user


def _hm_mins(value) -> Optional[int]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parts = raw.split(":")
        return int(parts[0]) * 60 + int(parts[1] if len(parts) > 1 else 0)
    except (TypeError, ValueError, IndexError):
        return None


def windows_overlap(start_a, end_a, start_b, end_b) -> bool:
    def spans(start, end):
        s, e = _hm_mins(start), _hm_mins(end)
        if s is None or e is None:
            return [(0, 24 * 60)]
        if e <= s:
            return [(s, 24 * 60), (0, e)]
        return [(s, e)]

    for a0, a1 in spans(start_a, end_a):
        for b0, b1 in spans(start_b, end_b):
            if a0 < b1 and b0 < a1:
                return True
    return False


def staff_assignments_today(db: Session, user: User) -> list[Assignment]:
    company = get_company_by_user_id(db, user.id)
    guard = get_linked_guard(db, user)
    if not guard:
        return []
    zone = _company_zone(company)
    now = datetime.now(zone)
    today = now.date()
    yesterday = today - timedelta(days=1)
    rows = (
        db.query(Assignment)
        .filter(Assignment.guard_id == guard.id, Assignment.date.in_([yesterday, today]))
        .all()
    )
    out: list[Assignment] = []
    for a in rows:
        if a.date == today:
            out.append(a)
            continue
        end = _assignment_shift_end_dt(a)
        if end is None:
            continue
        if end.replace(tzinfo=zone) > now:
            out.append(a)
    return out


def patrol_match(
    db: Session, user: User, *, route: Optional[PatrolRoute] = None
) -> tuple[Optional[PatrolRoute], Optional[Assignment], str]:
    company = get_company_by_user_id(db, user.id)
    assignments = staff_assignments_today(db, user)
    if not assignments:
        return None, None, "Patrol is only available during an assigned shift."
    site_ids = {a.site_id for a in assignments if a.site_id}
    if not site_ids:
        return None, None, "Patrol is not configured for your assigned site and shift."
    q = (
        db.query(PatrolRoute)
        .filter(
            PatrolRoute.company_id == company.id,
            PatrolRoute.status == "active",
            PatrolRoute.deleted_at.is_(None),
            PatrolRoute.site_id.in_(site_ids),
        )
    )
    if route is not None:
        q = q.filter(PatrolRoute.id == route.id)
    for r in q.order_by(PatrolRoute.id.asc()).all():
        for a in assignments:
            if a.site_id != r.site_id:
                continue
            if windows_overlap(a.shift_start, a.shift_end, r.start_time, r.end_time):
                return r, a, ""
    return None, None, "Patrol is not configured for your assigned site and shift."


def lone_worker_match(db: Session, user: User, *, site_id: Optional[int] = None):
    company = get_company_by_user_id(db, user.id)
    assignments = staff_assignments_today(db, user)
    if not assignments:
        return None, None, "Lone Worker is only available during an assigned shift."
    wanted = [a for a in assignments if site_id is None or a.site_id == site_id]
    if not wanted:
        return None, None, "Lone Worker is not configured for your assigned site and shift."
    for a in wanted:
        policy = resolve_policy(db, company.id, a.site_id)
        if policy:
            return policy, a, ""
    return None, None, "Lone Worker is not configured for your assigned site and shift."


def assert_patrol_start(db: Session, user: User, route: PatrolRoute) -> Optional[Assignment]:
    if not is_staff_portal_user(user):
        return None
    matched, assignment, msg = patrol_match(db, user, route=route)
    if matched is None:
        raise HTTPException(status_code=400, detail=msg)
    return assignment


def assert_lone_worker_start(db: Session, user: User, site_id: Optional[int]):
    if not is_staff_portal_user(user):
        return None, None
    policy, assignment, msg = lone_worker_match(db, user, site_id=site_id)
    if policy is None or assignment is None:
        raise HTTPException(status_code=400, detail=msg)
    return policy, assignment


def ops_eligibility(db: Session, user: User) -> OpsEligibilityResponse:
    if not is_staff_portal_user(user):
        return OpsEligibilityResponse(patrol_enabled=True, lone_worker_enabled=True)
    route, patrol_assignment, patrol_reason = patrol_match(db, user)
    policy, lw_assignment, lw_reason = lone_worker_match(db, user)
    assignment = lw_assignment or patrol_assignment
    return OpsEligibilityResponse(
        patrol_enabled=route is not None,
        patrol_reason=None if route else patrol_reason,
        patrol_route_id=route.id if route else None,
        lone_worker_enabled=policy is not None,
        lone_worker_reason=None if policy else lw_reason,
        site_id=assignment.site_id if assignment else None,
        assignment_id=assignment.id if assignment else None,
    )
