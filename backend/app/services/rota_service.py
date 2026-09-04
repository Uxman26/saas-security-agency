from __future__ import annotations

import json
import re
from datetime import date, datetime, time
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models import Assignment, Attendance, Client, Guard, RotaPlan, ShiftLateLog, Site, User
from app.schemas import RotaDetailResponse, RotaSummaryRow
from app.services.company_service import get_company_by_user_id
from app.services.work_filters import EMPTY_SCOPE, WorkScope, resolve_work_scope

def normalize_shift_type(st: Optional[str]) -> str:
    if not st:
        return "day"
    s = st.lower().strip()
    if s == "holiday":
        return "weekend"
    if s in ("day", "night", "weekend"):
        return s
    return "day"


def parse_shift_minutes(t: Optional[str]) -> Optional[int]:
    """Parse a clock time into minutes from midnight. Returns None if blank/unparseable."""
    if t is None:
        return None
    raw = str(t).strip()
    if not raw:
        return None
    # ISO datetime / datetime-local → take time portion
    if "T" in raw:
        raw = raw.split("T", 1)[1]
    raw = raw.split("Z")[0].split("+")[0].split(".")[0].strip()
    # 09:00 / 9:00 / 09:00:00
    m = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$", raw)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        ampm = m.group(4)
        if ampm:
            ampm = ampm.upper()
            if ampm == "PM" and h < 12:
                h += 12
            elif ampm == "AM" and h == 12:
                h = 0
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return h * 60 + mi
        return None
    # Compact HHMM
    m2 = re.match(r"^(\d{2})(\d{2})$", raw)
    if m2:
        h, mi = int(m2.group(1)), int(m2.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return h * 60 + mi
    return None


def calc_shift_hours(start: Optional[str], end: Optional[str], break_minutes: Optional[int] = 0) -> float:
    """Net hours from start/end clock times, deducting unpaid break. Overnight shifts supported."""
    start_mins = parse_shift_minutes(start)
    end_mins = parse_shift_minutes(end)
    if start_mins is None or end_mins is None:
        return 0.0
    if end_mins <= start_mins:
        end_mins += 24 * 60
    brk = max(0, int(break_minutes or 0))
    mins = end_mins - start_mins - brk
    return max(0.0, mins / 60.0)


def shift_hours(a: Assignment) -> float:
    return calc_shift_hours(a.shift_start, a.shift_end, a.break_minutes)


def _assignment_base_query(db: Session, company_id: int):
    return (
        db.query(Assignment)
        .join(Guard)
        .join(Site)
        .options(joinedload(Assignment.guard), joinedload(Assignment.site).joinedload(Site.client))
        .filter(Guard.company_id == company_id)
    )


def _scope_for_portal_user(db: Session, user_id: int, q):
    """Narrow a rota query to what a portal login is allowed to see.

    guard_id/site_id/client_id on the rota endpoints come straight from the query
    string, so they select *within* a scope and can never establish one. Without this
    a Client login granted the Rota module would read every shift in the company,
    including other clients' sites.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return q
    from app.services.portal_access import filter_assignments_for_user, is_portal_role

    if is_portal_role(user):
        return filter_assignments_for_user(db, user, q)
    return q


def _apply_rota_filters(q, guard_id, site_id, client_id, start_date, end_date, scope: WorkScope = EMPTY_SCOPE):
    """Date window plus the shared Client/Site/Contractor/Staff/Job-title scope.

    guard_id/site_id/client_id are already folded into ``scope`` by the callers below;
    they stay in the signature so the older positional call sites keep working, and are
    applied here only when no scope was resolved for them.
    """
    if not scope.active:
        if guard_id:
            q = q.filter(Assignment.guard_id == guard_id)
        if site_id:
            q = q.filter(Assignment.site_id == site_id)
        if client_id:
            q = q.filter(Site.client_id == client_id)
    else:
        q = scope.apply(q, Assignment.site_id, Assignment.guard_id)
    if start_date:
        q = q.filter(Assignment.date >= start_date)
    if end_date:
        q = q.filter(Assignment.date <= end_date)
    return q


def _attendance_status(a: Assignment, att: Optional[Attendance], late_log: Optional[ShiftLateLog], today: date) -> str:
    if late_log:
        return "late"
    if a.date > today:
        return "scheduled"
    if att and att.booked_at:
        return "late" if att.status == "late" else "on_time"
    if a.date < today:
        return "absent"
    return "pending"


def _late_minutes(a: Assignment, att: Optional[Attendance], late_log: Optional[ShiftLateLog]) -> Optional[int]:
    if late_log:
        return late_log.late_minutes
    if not att or not att.booked_at or not a.shift_start or att.status != "late":
        return None
    try:
        parts = a.shift_start.split(":")
        sh, sm = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
        due = datetime.combine(a.date, time(sh, sm))
        actual = att.booked_at.replace(tzinfo=None) if att.booked_at.tzinfo else att.booked_at
        diff = (actual - due).total_seconds() / 60.0
        if diff > 0:
            return int(diff)
    except (ValueError, IndexError, TypeError):
        pass
    return None


def list_rota_details(
    db: Session,
    user_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    client_id: Optional[int] = None,
    *,
    contractor_id: Optional[str] = None,
    sub_contractor_id: Optional[str] = None,
    job_title: Optional[str] = None,
) -> List[RotaDetailResponse]:
    """Every rota'd shift in the window, filtered by any combination of client, site,
    contractor, sub-contractor, staff member and job title.

    Picking a client covers all of that client's sites — the scope resolves the client
    to its site ids before anything queries.
    """
    company = get_company_by_user_id(db, user_id)
    scope = resolve_work_scope(
        db,
        company.id,
        client_id=client_id,
        site_id=site_id,
        contractor_id=contractor_id,
        sub_contractor_id=sub_contractor_id,
        guard_id=guard_id,
        job_title=job_title,
    )
    q = _assignment_base_query(db, company.id)
    q = _scope_for_portal_user(db, user_id, q)
    q = _apply_rota_filters(q, guard_id, site_id, client_id, start_date, end_date, scope)
    rows = q.order_by(Assignment.date, Guard.full_name).all()
    today = date.today()
    att_map = {}
    late_map = {}
    if rows:
        ids = [r.id for r in rows]
        for att in db.query(Attendance).filter(Attendance.assignment_id.in_(ids)).all():
            if att.assignment_id not in att_map:
                att_map[att.assignment_id] = att
        for log in db.query(ShiftLateLog).filter(ShiftLateLog.assignment_id.in_(ids)).all():
            if log.assignment_id not in late_map:
                late_map[log.assignment_id] = log
    out: List[RotaDetailResponse] = []
    # Fingerprints to avoid double-counting draft planner rows already published as assignments
    seen = set()
    for a in rows:
        att = att_map.get(a.id)
        late_log = late_map.get(a.id)
        g = a.guard
        site = a.site
        cli: Optional[Client] = site.client if site else None
        hrs = shift_hours(a)
        st = normalize_shift_type(a.shift_type)
        status = _attendance_status(a, att, late_log, today)
        late_m = _late_minutes(a, att, late_log) if status == "late" else None
        out.append(
            RotaDetailResponse(
                id=a.id,
                guard_id=a.guard_id,
                guard_name=g.full_name if g else "",
                site_id=a.site_id,
                site_name=site.name if site else "",
                client_id=site.client_id if site else None,
                client_name=cli.name if cli else None,
                date=a.date,
                shift_start=a.shift_start,
                shift_end=a.shift_end,
                break_minutes=a.break_minutes or 0,
                shift_type=st,
                hours=round(hrs, 2),
                attendance_status=status,
                late_minutes=late_m,
                shift_rate=a.shift_rate,
            )
        )
        seen.add(_shift_fingerprint(a.guard_id, a.date, a.shift_start, a.shift_end, a.site_id))

    # Include draft / unpublished rota planner shifts so reports match the on-screen rota
    if start_date and end_date:
        out.extend(
            _planner_shift_details(
                db,
                company.id,
                start_date,
                end_date,
                seen,
                today,
                scope=scope,
            )
        )
    out.sort(key=lambda d: (d.date, (d.guard_name or "").lower(), d.shift_start or ""))
    return out


def _shift_fingerprint(guard_id, dk, start, end, site_id) -> tuple:
    return (
        int(guard_id),
        str(dk),
        str(start or "").strip(),
        str(end or "").strip(),
        int(site_id) if site_id is not None else 0,
    )


def _parse_planner_json(raw) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def _planner_shift_details(
    db: Session,
    company_id: int,
    start_date: date,
    end_date: date,
    seen: set,
    today: date,
    scope: WorkScope = EMPTY_SCOPE,
) -> List[RotaDetailResponse]:
    """Load shifts from unpublished rota plans overlapping the report period."""
    plans = (
        db.query(RotaPlan)
        .filter(
            RotaPlan.company_id == company_id,
            RotaPlan.start_date <= end_date,
            RotaPlan.end_date >= start_date,
            RotaPlan.status != "published",
        )
        .all()
    )
    if not plans:
        return []

    sites = {s.id: s for s in db.query(Site).filter(Site.company_id == company_id).all()}
    site_by_name = {(s.name or "").strip().lower(): s for s in sites.values() if s.name}
    guards = {g.id: g for g in db.query(Guard).filter(Guard.company_id == company_id).all()}
    out: List[RotaDetailResponse] = []
    synthetic_id = -1

    for plan in plans:
        data = _parse_planner_json(plan.planner_data)
        shifts = data.get("shifts") or {}
        for emp_id, by_d in shifts.items():
            try:
                gid = int(emp_id)
            except (TypeError, ValueError):
                continue
            guard = guards.get(gid)
            if not guard:
                continue
            for dk, day_shifts in (by_d or {}).items():
                try:
                    d = date.fromisoformat(str(dk)[:10])
                except ValueError:
                    continue
                if d < start_date or d > end_date:
                    continue
                for sh in day_shifts or []:
                    start_t = (sh.get("start") or "").strip()
                    end_t = (sh.get("end") or "").strip()
                    site_name = (sh.get("site") or "").strip()
                    site = site_by_name.get(site_name.lower()) if site_name else None
                    sid = site.id if site else None
                    # A draft shift names its site as free text. When it does not
                    # resolve to a site record there is nothing to test a site-side
                    # filter against, so it is left out rather than let through.
                    if not scope.matches(sid, gid):
                        continue
                    fp = _shift_fingerprint(gid, d, start_t, end_t, sid)
                    if fp in seen:
                        continue
                    seen.add(fp)
                    break_m = int(sh.get("breakM") or 0) + int(sh.get("breakH") or 0) * 60
                    hrs = calc_shift_hours(start_t, end_t, break_m)
                    if d > today:
                        status = "scheduled"
                    elif d < today:
                        status = "pending"
                    else:
                        status = "pending"
                    cli = site.client if site else None
                    out.append(
                        RotaDetailResponse(
                            id=synthetic_id,
                            guard_id=gid,
                            guard_name=guard.full_name or "",
                            site_id=sid or 0,
                            site_name=site.name if site else site_name,
                            client_id=site.client_id if site else None,
                            client_name=cli.name if cli else None,
                            date=d,
                            shift_start=start_t or None,
                            shift_end=end_t or None,
                            break_minutes=break_m,
                            shift_type="day",
                            hours=round(hrs, 2),
                            attendance_status=status,
                            late_minutes=None,
                        )
                    )
                    synthetic_id -= 1
    return out


def rota_summary(
    db: Session,
    user_id: int,
    start_date: date,
    end_date: date,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    client_id: Optional[int] = None,
    *,
    contractor_id: Optional[str] = None,
    sub_contractor_id: Optional[str] = None,
    job_title: Optional[str] = None,
) -> List[RotaSummaryRow]:
    details = list_rota_details(
        db,
        user_id,
        start_date,
        end_date,
        guard_id,
        site_id,
        client_id,
        contractor_id=contractor_id,
        sub_contractor_id=sub_contractor_id,
        job_title=job_title,
    )
    by_guard: dict[int, list] = {}
    for d in details:
        by_guard.setdefault(d.guard_id, []).append(d)
    days = (end_date - start_date).days + 1
    if days < 1:
        days = 1
    rows: List[RotaSummaryRow] = []
    for gid, items in sorted(by_guard.items(), key=lambda x: x[1][0].guard_name.lower()):
        g = db.query(Guard).filter(Guard.id == gid).first()
        name = items[0].guard_name
        wh = float(g.weekly_contracted_hours) if g and g.weekly_contracted_hours is not None else 40.0
        committed = wh * (days / 7.0)
        total_h = sum(x.hours for x in items)
        late_c = sum(1 for x in items if x.attendance_status == "late")
        ot = max(0.0, total_h - committed)
        rows.append(
            RotaSummaryRow(
                guard_id=gid,
                guard_name=name,
                total_hours=round(total_h, 2),
                late_arrivals=late_c,
                overtime_hours=round(ot, 2),
                committed_hours=round(committed, 2),
            )
        )
    return rows
