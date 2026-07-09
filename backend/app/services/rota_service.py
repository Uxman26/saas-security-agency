from __future__ import annotations

from datetime import date, datetime, time
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models import Assignment, Attendance, Client, Guard, ShiftLateLog, Site
from app.schemas import RotaDetailResponse, RotaSummaryRow
from app.services.company_service import get_company_by_user_id

def normalize_shift_type(st: Optional[str]) -> str:
    if not st:
        return "day"
    s = st.lower().strip()
    if s == "holiday":
        return "weekend"
    if s in ("day", "night", "weekend"):
        return s
    return "day"


def shift_hours(a: Assignment) -> float:
    def _parse(t: Optional[str]) -> int:
        if not t:
            return 0
        try:
            parts = str(t).strip().split(":")
            return int(parts[0]) * 60 + (int(parts[1]) if len(parts) > 1 else 0)
        except (ValueError, IndexError):
            return 0

    start_mins = _parse(a.shift_start)
    end_mins = _parse(a.shift_end)
    if start_mins == 0 and end_mins == 0:
        return 0.0
    if end_mins <= start_mins:
        end_mins += 24 * 60
    mins = end_mins - start_mins - (a.break_minutes or 0)
    return max(0.0, mins / 60.0)


def _assignment_base_query(db: Session, company_id: int):
    return (
        db.query(Assignment)
        .join(Guard)
        .join(Site)
        .options(joinedload(Assignment.guard), joinedload(Assignment.site).joinedload(Site.client))
        .filter(Guard.company_id == company_id)
    )


def _apply_rota_filters(q, guard_id, site_id, client_id, start_date, end_date):
    if guard_id:
        q = q.filter(Assignment.guard_id == guard_id)
    if site_id:
        q = q.filter(Assignment.site_id == site_id)
    if client_id:
        q = q.filter(Site.client_id == client_id)
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
) -> List[RotaDetailResponse]:
    company = get_company_by_user_id(db, user_id)
    q = _assignment_base_query(db, company.id)
    q = _apply_rota_filters(q, guard_id, site_id, client_id, start_date, end_date)
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
            )
        )
    return out


def rota_summary(
    db: Session,
    user_id: int,
    start_date: date,
    end_date: date,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    client_id: Optional[int] = None,
) -> List[RotaSummaryRow]:
    details = list_rota_details(db, user_id, start_date, end_date, guard_id, site_id, client_id)
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
