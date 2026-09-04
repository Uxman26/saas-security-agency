import json
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import Assignment, Attendance, Guard, RotaPlan, ShiftAuditLog, Site
from app.schemas import RotaPlanCopy, RotaPlanCreate, RotaPlanDetail, RotaPlanListItem, RotaPlanPublishResult, RotaPlanUpdate
from app.services import shift_audit_service
from app.services.company_service import get_company_by_user_id
from app.services.rota_service import normalize_shift_type
from app.services.work_filters import WorkScope, resolve_work_scope


def _block_portal_roles(db: Session, user_id: int) -> None:
    """Refuse a portal login outright. Used on every path that writes a plan.

    Editing is all-or-nothing: planner_data is one JSON tree covering every employee and
    every site in the company, so a client saving it would be writing other clients'
    shifts. Reads are different — see _portal_user, which serves portal logins a copy
    rebuilt from their own sites' assignments instead of the stored tree.
    """
    from app.models import User
    from app.services.portal_access import is_portal_role

    user = db.query(User).filter(User.id == user_id).first()
    if user and is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _portal_user(db: Session, user_id: int):
    """The caller if they are a portal login, else None."""
    from app.models import User
    from app.services.portal_access import is_portal_role

    user = db.query(User).filter(User.id == user_id).first()
    if user and is_portal_role(user):
        return user
    return None


def _visible_site_ids(db: Session, user) -> set[int]:
    """Site ids this portal login may see, via the same filter the Sites list uses."""
    from app.services.portal_access import filter_sites_for_user

    q = filter_sites_for_user(db, user, db.query(Site.id).filter(Site.company_id == user.company_id))
    return {row[0] for row in q.all()}


def _portal_guard_id(db: Session, user) -> Optional[int]:
    """The guard a Staff login is limited to, or None for a Client login.

    Site scope alone is too wide for Staff. staff_site_ids resolves to every site the
    guard has ever been rota'd onto, so filtering a rota by site would show them every
    colleague's shifts, rates and hours at those sites — which is what the Assignments
    and attendance modules already refuse via filter_assignments_for_user. Clients are
    different: a rota for their own site is theirs to read in full.

    Returns _NO_GUARD when a Staff login has no guard record, so callers fail closed
    instead of falling back to the client-style site-wide scope.
    """
    from app.services.portal_access import get_linked_guard, is_staff_portal_user

    if not is_staff_portal_user(user):
        return None
    guard = get_linked_guard(db, user)
    return guard.id if guard else _NO_GUARD


# No guard row can have this id, so it matches nothing.
_NO_GUARD = -1


def _end_date(start: date, day_count: int) -> date:
    return start + timedelta(days=max(1, day_count) - 1)


def _count_shifts_from_json(planner_data: Optional[str]) -> int:
    if not planner_data:
        return 0
    try:
        data = json.loads(planner_data)
    except json.JSONDecodeError:
        return 0
    n = 0
    for by_d in (data.get("shifts") or {}).values():
        for day_shifts in (by_d or {}).values():
            n += len(day_shifts or [])
    return n


def _count_staff_from_json(planner_data: Optional[str]) -> int:
    if not planner_data:
        return 0
    try:
        data = json.loads(planner_data)
    except json.JSONDecodeError:
        return 0
    return len(data.get("employees") or [])


def _span_from_planner_days(planner_data: Optional[str]) -> Optional[tuple]:
    """Derive start/end/day_count from planner days[] when present."""
    if not planner_data:
        return None
    try:
        data = json.loads(planner_data)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    days = data.get("days") or []
    if not isinstance(days, list) or not days:
        return None
    try:
        start = date.fromisoformat(str(days[0])[:10])
        end = date.fromisoformat(str(days[-1])[:10])
    except ValueError:
        return None
    return start, end, len(days)


def _apply_plan_span(plan: RotaPlan, start: date, day_count: int) -> None:
    n = max(1, min(90, int(day_count)))
    plan.start_date = start
    plan.day_count = n
    plan.end_date = _end_date(start, n)


def _to_list_item(db: Session, plan: RotaPlan) -> RotaPlanListItem:
    if plan.status == "published":
        shift_count = db.query(Assignment).filter(Assignment.rota_plan_id == plan.id).count()
        staff_count = (
            db.query(func.count(func.distinct(Assignment.guard_id)))
            .filter(Assignment.rota_plan_id == plan.id)
            .scalar()
            or 0
        )
    else:
        shift_count = _count_shifts_from_json(plan.planner_data)
        staff_count = _count_staff_from_json(plan.planner_data)
    # Prefer live planner length so list dates update when days are added/removed
    span = _span_from_planner_days(plan.planner_data)
    start_date = span[0] if span else plan.start_date
    end_date = span[1] if span else plan.end_date
    day_count = span[2] if span else plan.day_count
    return RotaPlanListItem(
        id=plan.id,
        name=plan.name,
        start_date=start_date,
        end_date=end_date,
        day_count=day_count,
        view_mode=plan.view_mode,
        budget=float(plan.budget or 0),
        status=plan.status,
        shift_count=shift_count,
        staff_count=int(staff_count),
        created_at=plan.created_at,
        published_at=plan.published_at,
    )


def _plan_matches_scope(db: Session, plan: RotaPlan, scope: WorkScope, site_ids_by_name: dict) -> bool:
    """Whether a rota holds at least one shift the filters allow.

    A published rota is checked against its assignments; a draft only exists as planner
    JSON, whose shifts name their site as free text, so those names are matched back to
    site records before the scope is applied.
    """
    if plan.status == "published":
        q = db.query(Assignment.id).filter(Assignment.rota_plan_id == plan.id)
        q = scope.apply(q, Assignment.site_id, Assignment.guard_id)
        return db.query(q.exists()).scalar() is True

    try:
        data = json.loads(plan.planner_data or "{}")
    except (json.JSONDecodeError, TypeError):
        return False
    if not isinstance(data, dict):
        return False
    for emp_id, by_day in (data.get("shifts") or {}).items():
        try:
            gid = int(emp_id)
        except (TypeError, ValueError):
            continue
        for day_shifts in (by_day or {}).values():
            for sh in day_shifts or []:
                if not isinstance(sh, dict):
                    continue
                name = str(sh.get("site") or "").strip().lower()
                if scope.matches(site_ids_by_name.get(name), gid):
                    return True
    return False


def list_rota_plans(
    db: Session,
    user_id: int,
    *,
    client_id: Optional[int] = None,
    site_id: Optional[int] = None,
    contractor_id: Optional[str] = None,
    sub_contractor_id: Optional[str] = None,
    guard_id: Optional[int] = None,
    job_title: Optional[str] = None,
) -> List[RotaPlanListItem]:
    """The rota list, optionally narrowed to rotas that contain matching shifts.

    Picking a client keeps every rota touching any of that client's sites — the scope
    resolves the client to its site ids first, so all ten of its sites are covered by
    the one pick.
    """
    company = get_company_by_user_id(db, user_id)
    rows = (
        db.query(RotaPlan)
        .filter(RotaPlan.company_id == company.id)
        .order_by(RotaPlan.created_at.desc())
        .all()
    )
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
    if scope.active:
        site_ids_by_name = {
            (name or "").strip().lower(): sid
            for sid, name in db.query(Site.id, Site.name).filter(Site.company_id == company.id).all()
            if name
        }
        rows = [p for p in rows if _plan_matches_scope(db, p, scope, site_ids_by_name)]
    portal = _portal_user(db, user_id)
    if not portal:
        return [_to_list_item(db, p) for p in rows]

    # A portal login sees a rota only if it holds shifts it is allowed to read — their
    # own sites for a Client, their own shifts for a member of Staff — and the counts
    # describe just those shifts, never the whole company's. Drafts are invisible:
    # nothing is committed to a site until the rota is published, and the draft tree
    # names sites as free text with no site_id to filter on.
    site_ids = _visible_site_ids(db, portal)
    guard_id = _portal_guard_id(db, portal)
    out: List[RotaPlanListItem] = []
    if not site_ids:
        return out
    scope = [Assignment.site_id.in_(site_ids)]
    if guard_id is not None:
        scope.append(Assignment.guard_id == guard_id)
    for plan in rows:
        if plan.status != "published":
            continue
        visible = db.query(Assignment).filter(Assignment.rota_plan_id == plan.id, *scope)
        shift_count = visible.count()
        if not shift_count:
            continue
        staff_count = (
            db.query(func.count(func.distinct(Assignment.guard_id)))
            .filter(Assignment.rota_plan_id == plan.id, *scope)
            .scalar()
            or 0
        )
        item = _to_list_item(db, plan)
        out.append(item.model_copy(update={"shift_count": shift_count, "staff_count": int(staff_count)}))
    return out


_AVATAR_PALETTE = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#f97316"]
_SHIFT_COLOR_OPTS = [
    "#3b82f6",
    "#8b5cf6",
    "#6366f1",
    "#06b6d4",
    "#0ea5e9",
    "#14b8a6",
    "#10b981",
    "#22c55e",
    "#84cc16",
    "#eab308",
    "#f59e0b",
    "#f97316",
    "#ef4444",
    "#ec4899",
    "#d946ef",
    "#a855f7",
    "#64748b",
    "#78716f",
]
_SHIFT_COLOR = _SHIFT_COLOR_OPTS[0]


def _parse_planner(raw: Optional[str]) -> Optional[dict]:
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def _shift_count(shifts: Optional[dict]) -> int:
    n = 0
    for by_d in (shifts or {}).values():
        for blocks in (by_d or {}).values():
            n += len(blocks or [])
    return n


def _parse_shift_rate(raw) -> Optional[float]:
    if raw is None or raw == "":
        return None
    try:
        v = float(raw)
        return v if v >= 0 else None
    except (TypeError, ValueError):
        return None


def _delete_plan_assignments(db: Session, plan_id: int, guard_id: Optional[int] = None) -> None:
    q = db.query(Assignment.id).filter(Assignment.rota_plan_id == plan_id)
    if guard_id is not None:
        q = q.filter(Assignment.guard_id == guard_id)
    assignment_ids = [row[0] for row in q.all()]
    if assignment_ids:
        db.query(Attendance).filter(Attendance.assignment_id.in_(assignment_ids)).delete(
            synchronize_session=False
        )
        # Republishing recreates assignment rows, so history rows keep their snapshot and
        # drop the pointer rather than being deleted along with the assignment.
        db.query(ShiftAuditLog).filter(ShiftAuditLog.assignment_id.in_(assignment_ids)).update(
            {ShiftAuditLog.assignment_id: None}, synchronize_session=False
        )
    del_q = db.query(Assignment).filter(Assignment.rota_plan_id == plan_id)
    if guard_id is not None:
        del_q = del_q.filter(Assignment.guard_id == guard_id)
    del_q.delete(synchronize_session=False)


def _published_guard_ids(db: Session, plan_id: int) -> List[int]:
    rows = (
        db.query(Assignment.guard_id)
        .filter(Assignment.rota_plan_id == plan_id)
        .distinct()
        .all()
    )
    return sorted({int(r[0]) for r in rows if r[0] is not None})


def get_rota_plan(db: Session, user_id: int, plan_id: int) -> RotaPlanDetail:
    company = get_company_by_user_id(db, user_id)
    plan = db.query(RotaPlan).filter(RotaPlan.id == plan_id, RotaPlan.company_id == company.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Rota not found")
    portal = _portal_user(db, user_id)
    if portal:
        return _portal_rota_detail(db, portal, plan)
    base = _to_list_item(db, plan)
    return RotaPlanDetail(
        **base.model_dump(),
        planner_data=plan.planner_data,
        published_guard_ids=_published_guard_ids(db, plan.id),
    )


def _portal_rota_detail(db: Session, user, plan: RotaPlan) -> RotaPlanDetail:
    """A rota as a portal login may see it: their own sites for a Client, their own
    shifts for a member of Staff.

    The stored planner_data is never handed over. The payload is rebuilt from the
    Assignment rows for this plan that the login is allowed to read, so a client cannot
    read another client's shifts, and a guard cannot read a colleague's, even though
    all of them live in the same plan.
    """
    site_ids = _visible_site_ids(db, user)
    guard_id = _portal_guard_id(db, user)
    if plan.status != "published" or not site_ids:
        raise HTTPException(status_code=404, detail="Rota not found")
    payload = _payload_from_assignments(
        db, plan, _parse_planner(plan.planner_data), site_ids=site_ids, guard_id=guard_id
    )
    if not payload["shifts"]:
        raise HTTPException(status_code=404, detail="Rota not found")
    shift_count = sum(len(v) for by_day in payload["shifts"].values() for v in by_day.values())
    base = _to_list_item(db, plan).model_copy(
        update={"shift_count": shift_count, "staff_count": len(payload["employees"])}
    )
    return RotaPlanDetail(
        **base.model_dump(),
        planner_data=json.dumps(payload),
        # Publish state is an internal concern and drives buttons this login cannot use.
        published_guard_ids=[],
    )


_SHIFT_TYPES = {"morning", "afternoon", "evening", "night"}


def _parse_shift_type(value) -> Optional[str]:
    v = str(value or "").strip().lower()
    return v if v in _SHIFT_TYPES else None


def _normalize_shift(block: dict, idx: int = 0) -> dict:
    b = dict(block or {})
    color = (b.get("color") or "").strip()
    if not color:
        color = _SHIFT_COLOR_OPTS[idx % len(_SHIFT_COLOR_OPTS)]
    out = {
        "start": b.get("start") or "09:00",
        "end": b.get("end") or "17:00",
        "site": b.get("site") or "",
        "notes": b.get("notes") or "",
        "breakH": int(b.get("breakH") or 0),
        "breakM": int(b.get("breakM") or 0),
        "color": color,
        "label": b.get("label") or "",
        "shiftType": _parse_shift_type(b.get("shiftType")),
        "shiftRate": _parse_shift_rate(b.get("shiftRate")),
        "scheduledEnd": b.get("scheduledEnd") or "",
        "adjustments": b.get("adjustments") or [],
    }
    scheduled_start = (b.get("scheduledStart") or "").strip()
    if scheduled_start:
        out["scheduledStart"] = scheduled_start
    return out


def _normalize_employee(emp: dict, idx: int) -> dict:
    e = dict(emp or {})
    eid = str(e.get("id") or "")
    color = (e.get("avatarColor") or "").strip()
    if not color:
        color = _AVATAR_PALETTE[idx % len(_AVATAR_PALETTE)]
    return {
        "id": eid,
        "name": e.get("name") or "",
        "role": e.get("role") or "Staff",
        "avatarColor": color,
        "rotaPending": bool(e.get("rotaPending")),
    }


def _normalize_shifts_tree(shifts: Optional[dict]) -> dict[str, dict[str, list]]:
    out: dict[str, dict[str, list]] = {}
    for emp_id, by_d in (shifts or {}).items():
        emp_map: dict[str, list] = {}
        for dk, blocks in (by_d or {}).items():
            emp_map[str(dk)] = [_normalize_shift(b, i) for i, b in enumerate(blocks or []) if isinstance(b, dict)]
        if emp_map:
            out[str(emp_id)] = emp_map
    return out


def _planner_shift_lookup(planner: Optional[dict]) -> dict[tuple[str, str, str, str], dict]:
    lookup: dict[tuple[str, str, str, str], dict] = {}
    for emp_id, by_d in (planner.get("shifts") or {}).items() if planner else {}:
        for dk, blocks in (by_d or {}).items():
            for b in blocks or []:
                if not isinstance(b, dict):
                    continue
                key = (str(emp_id), str(dk), str(b.get("start") or ""), str(b.get("end") or ""))
                lookup[key] = b
    return lookup


def _normalize_payload(data: dict, plan: RotaPlan) -> dict:
    employees_raw = data.get("employees") or []
    employees = [_normalize_employee(e, i) for i, e in enumerate(employees_raw) if isinstance(e, dict)]
    emp_by_id = {e["id"]: e for e in employees}
    for i, e in enumerate(employees):
        if not e["id"]:
            continue
        emp_by_id[e["id"]] = e

    attendance = {}
    for key, rec in (data.get("attendance") or {}).items():
        if isinstance(rec, dict):
            attendance[str(key)] = dict(rec)

    return {
        "rotaView": data.get("rotaView") or plan.view_mode or "table",
        "days": list(data.get("days") or _day_keys(plan.start_date, plan.day_count)),
        "employees": employees,
        "shifts": _normalize_shifts_tree(data.get("shifts")),
        "attendance": attendance,
        "budget": float(data.get("budget") if data.get("budget") is not None else plan.budget or 0),
        "inclBreaks": bool(data.get("inclBreaks", False)),
    }


def _merge_planner_with_assignments(planner: dict, built: dict, plan: RotaPlan) -> dict:
    lookup = _planner_shift_lookup(planner)
    p_shifts = _normalize_shifts_tree(planner.get("shifts"))
    merged_shifts = dict(p_shifts)

    for emp_id, by_d in (built.get("shifts") or {}).items():
        for dk, blocks in (by_d or {}).items():
            for i, b in enumerate(blocks or []):
                if not isinstance(b, dict):
                    continue
                key = (str(emp_id), str(dk), str(b.get("start") or ""), str(b.get("end") or ""))
                if key in lookup:
                    merged_shifts.setdefault(str(emp_id), {}).setdefault(str(dk), []).append(
                        _normalize_shift(lookup[key], i)
                    )
                elif str(emp_id) not in merged_shifts or str(dk) not in merged_shifts.get(str(emp_id), {}):
                    merged_shifts.setdefault(str(emp_id), {}).setdefault(str(dk), []).append(_normalize_shift(b, i))

    p_emps = {
        str(e["id"]): _normalize_employee(e, i)
        for i, e in enumerate(planner.get("employees") or [])
        if isinstance(e, dict) and e.get("id")
    }
    b_emps = {
        str(e["id"]): _normalize_employee(e, i)
        for i, e in enumerate(built.get("employees") or [])
        if isinstance(e, dict) and e.get("id")
    }
    employees = []
    seen: set[str] = set()
    for src in (planner.get("employees") or []) + (built.get("employees") or []):
        if not isinstance(src, dict) or not src.get("id"):
            continue
        eid = str(src["id"])
        if eid in seen:
            continue
        seen.add(eid)
        pe = p_emps.get(eid, {})
        be = b_emps.get(eid, {})
        # Prefer live guard name/job_title (built) so rota always reflects Staff profile
        employees.append(
            {
                "id": eid,
                "name": be.get("name") or pe.get("name") or "",
                "role": be.get("role") or pe.get("role") or "Staff",
                "avatarColor": pe.get("avatarColor") or be.get("avatarColor") or _AVATAR_PALETTE[len(employees) % len(_AVATAR_PALETTE)],
            }
        )

    return {
        "rotaView": planner.get("rotaView") or built.get("rotaView") or plan.view_mode or "table",
        "days": list(planner.get("days") or built.get("days") or _day_keys(plan.start_date, plan.day_count)),
        "employees": employees,
        "shifts": merged_shifts if merged_shifts else _normalize_shifts_tree(built.get("shifts")),
        "attendance": dict(planner.get("attendance") or {}),
        "budget": float(
            planner.get("budget") if planner.get("budget") is not None else built.get("budget") if built.get("budget") is not None else plan.budget or 0
        ),
        "inclBreaks": bool(planner.get("inclBreaks", built.get("inclBreaks", False))),
    }


def _day_keys(start: date, day_count: int) -> list[str]:
    n = max(1, day_count)
    return [(start + timedelta(days=i)).isoformat() for i in range(n)]


def _payload_from_assignments(
    db: Session,
    plan: RotaPlan,
    planner: Optional[dict] = None,
    site_ids: Optional[set[int]] = None,
    guard_id: Optional[int] = None,
) -> dict:
    """Rebuild a planner payload from this plan's assignment rows.

    ``site_ids`` narrows it to those sites, which is what makes the result safe to hand
    a portal login: assignments carry a real site_id, unlike the draft tree's free-text
    site names. ``guard_id`` narrows it further to one guard's own shifts, which is the
    scope a Staff login gets.
    """
    lookup = _planner_shift_lookup(planner)
    q = (
        db.query(Assignment)
        .options(joinedload(Assignment.guard), joinedload(Assignment.site))
        .filter(Assignment.rota_plan_id == plan.id)
    )
    if site_ids is not None:
        q = q.filter(Assignment.site_id.in_(site_ids or {0}))
    if guard_id is not None:
        q = q.filter(Assignment.guard_id == guard_id)
    rows = q.order_by(Assignment.date, Assignment.id).all()
    days = _day_keys(plan.start_date, plan.day_count)
    employees: dict[str, dict] = {}
    shifts: dict[str, dict[str, list]] = {}
    slot_by_assignment: dict[int, str] = {}
    shift_idx = 0
    for a in rows:
        if not a.guard:
            continue
        eid = str(a.guard_id)
        if eid not in employees:
            idx = len(employees)
            pe = None
            if planner:
                for e in planner.get("employees") or []:
                    if isinstance(e, dict) and str(e.get("id")) == eid:
                        pe = e
                        break
            employees[eid] = _normalize_employee(
                {
                    "id": eid,
                    "name": a.guard.full_name,
                    "role": a.guard.job_title or "Staff",
                    "avatarColor": (pe or {}).get("avatarColor"),
                },
                idx,
            )
        dk = a.date.isoformat()
        if dk not in days:
            continue
        bm = int(a.break_minutes or 0)
        base = {
            "start": a.shift_start or "09:00",
            "end": a.shift_end or "17:00",
            "site": (a.site.name if a.site else "") or "",
            "notes": "",
            "breakH": bm // 60,
            "breakM": bm % 60,
            "color": "",
            "label": "",
            "shiftRate": a.shift_rate,
        }
        matched = lookup.get((eid, dk, base["start"], base["end"]))
        if matched:
            base = {**base, **matched}
        slot = len(shifts.setdefault(eid, {}).setdefault(dk, []))
        shifts[eid][dk].append(_normalize_shift(base, shift_idx))
        slot_by_assignment[a.id] = f"{eid}:{dk}:{slot}"
        shift_idx += 1

    if site_ids is None:
        attendance = dict((planner or {}).get("attendance") or {})
    else:
        # The stored attendance map is keyed by the full planner's slot indices and
        # covers every site, so it cannot be reused for a filtered payload. Rebuild it
        # from the attendance rows of the shifts actually included.
        attendance = _attendance_for_assignments(db, slot_by_assignment)

    return {
        "rotaView": (planner or {}).get("rotaView") or plan.view_mode or "table",
        "days": list((planner or {}).get("days") or days),
        "employees": list(employees.values()),
        "shifts": shifts,
        "attendance": attendance,
        "budget": float((planner or {}).get("budget") if (planner or {}).get("budget") is not None else plan.budget or 0),
        "inclBreaks": bool((planner or {}).get("inclBreaks", False)),
    }


def _attendance_for_assignments(db: Session, slot_by_assignment: dict[int, str]) -> dict:
    """Attendance map keyed by the rebuilt slot indices, for the given assignments only."""
    if not slot_by_assignment:
        return {}
    out: dict[str, dict] = {}
    rows = (
        db.query(Attendance)
        .filter(Attendance.assignment_id.in_(list(slot_by_assignment)))
        .all()
    )
    for att in rows:
        key = slot_by_assignment.get(att.assignment_id)
        if not key or key in out:
            continue
        emp_id, dk, si = key.split(":")
        out[key] = {
            # Stored already normalised at write time (on_time / late / absent / …).
            "status": (att.status or "").strip(),
            "hours": "",
            "note": (att.note or ""),
            "empId": emp_id,
            "dk": dk,
            "si": int(si),
        }
    return out


def _extract_payload(db: Session, plan: RotaPlan) -> dict:
    planner = _parse_planner(plan.planner_data)
    built = _payload_from_assignments(db, plan, planner)

    if planner and _shift_count(planner.get("shifts")) > 0:
        return _normalize_payload(planner, plan)

    if _shift_count(built.get("shifts")) > 0:
        if planner:
            return _merge_planner_with_assignments(planner, built, plan)
        return _normalize_payload(built, plan)

    if planner:
        return _normalize_payload(planner, plan)

    return _normalize_payload(built, plan)


def _remap_payload(
    data: dict,
    old_start: date,
    old_day_count: int,
    new_start: date,
    new_day_count: int,
) -> dict:
    old_days = data.get("days") or _day_keys(old_start, old_day_count)
    new_days = _day_keys(new_start, new_day_count)
    day_map = {old_days[i]: new_days[i] for i in range(min(len(old_days), len(new_days)))}

    new_shifts: dict[str, dict[str, list]] = {}
    for emp_id, by_d in (data.get("shifts") or {}).items():
        emp_map: dict[str, list] = {}
        for old_dk, blocks in (by_d or {}).items():
            new_dk = day_map.get(old_dk)
            if new_dk and blocks:
                emp_map[new_dk] = [_normalize_shift(b, i) for i, b in enumerate(blocks) if isinstance(b, dict)]
        if emp_map:
            new_shifts[str(emp_id)] = emp_map

    new_attendance: dict[str, dict] = {}
    for key, rec in (data.get("attendance") or {}).items():
        parts = str(key).split(":", 2)
        if len(parts) != 3:
            continue
        emp_id, old_dk, si = parts[0], parts[1], parts[2]
        new_dk = day_map.get(old_dk)
        if not new_dk:
            continue
        entry = dict(rec) if isinstance(rec, dict) else {}
        entry["dk"] = new_dk
        entry["empId"] = emp_id
        try:
            entry["si"] = int(si)
        except (TypeError, ValueError):
            pass
        new_attendance[f"{emp_id}:{new_dk}:{si}"] = entry

    out = dict(data)
    out["days"] = new_days
    out["shifts"] = new_shifts
    out["attendance"] = new_attendance
    out["employees"] = [_normalize_employee(e, i) for i, e in enumerate(out.get("employees") or []) if isinstance(e, dict)]
    return out


def _strip_attendance_and_notes(payload: dict) -> dict:
    """Remove attendance records and shift notes / OT / early-finish adjustments."""
    out = dict(payload)
    out["attendance"] = {}
    cleaned_shifts: dict = {}
    for emp_id, by_d in (out.get("shifts") or {}).items():
        emp_map: dict = {}
        for dk, blocks in (by_d or {}).items():
            cleaned = []
            for i, b in enumerate(blocks or []):
                if not isinstance(b, dict):
                    continue
                sh = _normalize_shift(b, i)
                sh["notes"] = ""
                sh["adjustments"] = []
                sh["scheduledEnd"] = ""
                sh.pop("scheduledStart", None)
                cleaned.append(sh)
            if cleaned:
                emp_map[dk] = cleaned
        if emp_map:
            cleaned_shifts[str(emp_id)] = emp_map
    out["shifts"] = cleaned_shifts
    return out


def copy_rota_plan(db: Session, user_id: int, source_id: int, data: RotaPlanCopy) -> RotaPlanDetail:
    _block_portal_roles(db, user_id)
    company = get_company_by_user_id(db, user_id)
    source = db.query(RotaPlan).filter(RotaPlan.id == source_id, RotaPlan.company_id == company.id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source rota not found")

    day_count = max(1, min(90, data.day_count if data.day_count is not None else source.day_count))
    payload = _extract_payload(db, source)
    remapped = _remap_payload(payload, source.start_date, source.day_count, data.start_date, day_count)
    if not getattr(data, "include_attendance_and_notes", False):
        remapped = _strip_attendance_and_notes(remapped)
    if data.view_mode:
        remapped["rotaView"] = data.view_mode
    if data.budget is not None:
        remapped["budget"] = float(data.budget)

    return create_rota_plan(
        db,
        user_id,
        RotaPlanCreate(
            name=data.name.strip(),
            start_date=data.start_date,
            day_count=day_count,
            view_mode=data.view_mode or remapped.get("rotaView") or source.view_mode or "table",
            budget=float(data.budget if data.budget is not None else source.budget or 0),
            planner_data=json.dumps(remapped),
        ),
    )


def _log_rota_change(db: Session, company_id: int, user_id: int, plan: RotaPlan, prev: dict) -> None:
    """Record a rota-level change (rename or re-dated period) against its shift history."""
    changes = []
    if prev.get("name") != plan.name:
        changes.append({"field": "rota_name", "label": "Rota name", "from": prev.get("name"), "to": plan.name})
    if prev.get("start") != plan.start_date or prev.get("end") != plan.end_date:
        changes.append(
            {
                "field": "rota_period",
                "label": "Rota period",
                "from": f"{prev.get('start')} – {prev.get('end')}",
                "to": f"{plan.start_date} – {plan.end_date}",
            }
        )
    if not changes:
        return
    row = shift_audit_service.record(
        db,
        company_id=company_id,
        user_id=user_id,
        action="shift_rota_changed",
        rota_plan=plan,
        summary=f"Rota changed · {shift_audit_service.format_changes(changes)}",
    )
    row.changes = json.dumps(changes)


def create_rota_plan(db: Session, user_id: int, data: RotaPlanCreate) -> RotaPlanDetail:
    _block_portal_roles(db, user_id)
    company = get_company_by_user_id(db, user_id)
    day_count = max(1, min(90, data.day_count))
    plan = RotaPlan(
        company_id=company.id,
        name=data.name.strip(),
        start_date=data.start_date,
        end_date=_end_date(data.start_date, day_count),
        day_count=day_count,
        view_mode=data.view_mode or "table",
        budget=float(data.budget or 0),
        status="draft",
        planner_data=data.planner_data,
    )
    db.add(plan)
    db.flush()
    shift_audit_service.log_plan_shifts(
        db,
        company_id=company.id,
        user_id=user_id,
        plan=plan,
        planner_json=plan.planner_data,
        action="shift_created",
    )
    db.commit()
    db.refresh(plan)
    return get_rota_plan(db, user_id, plan.id)


def update_rota_plan(db: Session, user_id: int, plan_id: int, data: RotaPlanUpdate) -> RotaPlanDetail:
    _block_portal_roles(db, user_id)
    company = get_company_by_user_id(db, user_id)
    plan = db.query(RotaPlan).filter(RotaPlan.id == plan_id, RotaPlan.company_id == company.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Rota not found")
    payload = data.model_dump(exclude_unset=True)
    was_published = plan.status == "published"
    # Snapshot what the rota looked like before this edit — the planner PATCHes the whole
    # tree, so the diff against the stored copy is the only record of what the user did.
    prev_planner = plan.planner_data
    prev_rota = {"name": plan.name, "start": plan.start_date, "end": plan.end_date}
    if "name" in payload and payload["name"]:
        plan.name = payload["name"].strip()
    if "view_mode" in payload and payload["view_mode"]:
        plan.view_mode = payload["view_mode"]
    if "budget" in payload and payload["budget"] is not None:
        plan.budget = float(payload["budget"])
    if "planner_data" in payload:
        plan.planner_data = payload["planner_data"]
        # Keep list date range in sync when days are added/removed in the planner
        span = _span_from_planner_days(plan.planner_data)
        if span:
            _apply_plan_span(plan, span[0], span[2])
    if "start_date" in payload and payload["start_date"] is not None:
        start = payload["start_date"]
        count = payload.get("day_count")
        if count is None:
            count = plan.day_count
        _apply_plan_span(plan, start, count)
    elif "day_count" in payload and payload["day_count"] is not None:
        _apply_plan_span(plan, plan.start_date, payload["day_count"])
    if "status" in payload and payload["status"]:
        plan.status = payload["status"]
    if "planner_data" in payload:
        shift_audit_service.log_planner_change(
            db,
            company_id=company.id,
            user_id=user_id,
            plan=plan,
            old_planner_json=prev_planner,
            new_planner_json=plan.planner_data,
        )
    _log_rota_change(db, company.id, user_id, plan, prev_rota)
    db.commit()
    if "planner_data" in payload:
        if was_published:
            from app.services import attendance_service, rota_notify_service, shift_adjustment_service

            try:
                new_data = json.loads(plan.planner_data or "{}")
            except json.JSONDecodeError:
                new_data = {}
            # Only touch guards who already have published assignments — do not auto-publish drafts.
            published_ids = _published_guard_ids(db, plan.id)
            structural = False
            for gid in published_ids:
                before_fp = rota_notify_service.fingerprint_from_assignments(db, plan.id, gid)
                after_fp = rota_notify_service.fingerprint_from_planner_shifts(
                    new_data.get("shifts"), gid
                )
                if before_fp != after_fp:
                    publish_rota_plan(db, user_id, plan.id, guard_id=gid)
                    structural = True
            if not structural:
                # Attendance / notes / OT-only edits stay on existing assignments
                shift_adjustment_service.sync_published_plan_adjustments(db, user_id, plan)
                shift_adjustment_service.sync_published_plan_lateness(db, user_id, plan)
                attendance_service.sync_published_plan_attendance(db, user_id, plan)
        else:
            from app.services import attendance_service, shift_adjustment_service
            shift_adjustment_service.sync_published_plan_adjustments(db, user_id, plan)
            shift_adjustment_service.sync_published_plan_lateness(db, user_id, plan)
            attendance_service.sync_published_plan_attendance(db, user_id, plan)
    db.refresh(plan)
    return get_rota_plan(db, user_id, plan.id)


def delete_rota_plan(db: Session, user_id: int, plan_id: int) -> None:
    _block_portal_roles(db, user_id)
    company = get_company_by_user_id(db, user_id)
    plan = db.query(RotaPlan).filter(RotaPlan.id == plan_id, RotaPlan.company_id == company.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Rota not found")
    # Log before the rows go: the history keeps its own copy of the rota name and shift
    # detail, so it still reads correctly once the plan itself is gone.
    shift_audit_service.log_plan_shifts(
        db,
        company_id=company.id,
        user_id=user_id,
        plan=plan,
        planner_json=plan.planner_data,
        action="shift_deleted",
    )
    for row in db.query(ShiftAuditLog).filter(ShiftAuditLog.rota_plan_id == plan.id).all():
        row.rota_plan_id = None
    db.flush()
    _delete_plan_assignments(db, plan.id)
    db.delete(plan)
    db.commit()


def publish_rota_plan(
    db: Session, user_id: int, plan_id: int, guard_id: Optional[int] = None
) -> RotaPlanPublishResult:
    _block_portal_roles(db, user_id)
    company = get_company_by_user_id(db, user_id)
    plan = db.query(RotaPlan).filter(RotaPlan.id == plan_id, RotaPlan.company_id == company.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Rota not found")
    if not plan.planner_data:
        raise HTTPException(status_code=400, detail="Rota has no planner data to publish")

    try:
        data = json.loads(plan.planner_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid planner data")

    if guard_id is not None:
        guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
        if not guard:
            raise HTTPException(status_code=404, detail="Staff not found")

    from app.services import rota_notify_service

    before_fp = rota_notify_service.fingerprint_from_assignments(db, plan.id, guard_id)

    sites = db.query(Site).filter(Site.company_id == company.id).all()
    site_by_name = {s.name.strip().lower(): s.id for s in sites}

    def _resolve_site_id(raw_name: Optional[str], color: Optional[str] = None) -> Optional[int]:
        """Match existing site by name (case-insensitive) or create it from the shift form name."""
        name = (raw_name or "").strip()
        if not name:
            return None
        key = name.lower()
        existing = site_by_name.get(key)
        if existing:
            return existing
        # Collapse internal whitespace variants (e.g. double spaces)
        compact = " ".join(name.split()).lower()
        for k, sid in site_by_name.items():
            if " ".join(k.split()) == compact:
                return sid
        from app.services.plan_enforcement import enforce_site_quota

        try:
            enforce_site_quota(db, company)
        except HTTPException:
            return None
        site = Site(
            company_id=company.id,
            name=name,
            color=(color or "").strip() or "#3b82f6",
            site_type=1,
        )
        db.add(site)
        db.flush()
        site_by_name[key] = site.id
        return site.id

    _delete_plan_assignments(db, plan.id, guard_id)

    created = 0
    skipped = 0
    errors: list[str] = []
    shifts = data.get("shifts") or {}

    # One query for the company's staff instead of one per employee in the plan. The
    # membership test is the same — the id must belong to this company — it just reads
    # from a dict rather than a round trip per row.
    guard_ids_in_company = {
        row[0] for row in db.query(Guard.id).filter(Guard.company_id == company.id).all()
    }

    for emp_id, by_d in shifts.items():
        try:
            emp_guard_id = int(emp_id)
        except (TypeError, ValueError):
            skipped += 1
            continue
        if guard_id is not None and emp_guard_id != guard_id:
            continue
        if emp_guard_id not in guard_ids_in_company:
            skipped += 1
            errors.append(f"Staff {emp_id} not found")
            continue
        for dk, day_shifts in (by_d or {}).items():
            for idx, sh in enumerate(day_shifts or []):
                site_name = (sh.get("site") or "").strip()
                site_id = _resolve_site_id(site_name, sh.get("color"))
                if not site_id:
                    skipped += 1
                    errors.append(
                        f'No site named "{sh.get("site")}" ({dk}) — create it under Sites or free up site quota'
                        if site_name
                        else f"Missing site on {dk}"
                    )
                    continue
                break_m = int(sh.get("breakM") or 0) + int(sh.get("breakH") or 0) * 60
                assignment = Assignment(
                        guard_id=emp_guard_id,
                        site_id=site_id,
                        rota_plan_id=plan.id,
                        date=date.fromisoformat(dk),
                        shift_start=sh.get("start"),
                        shift_end=sh.get("end"),
                        break_minutes=break_m,
                        shift_type=normalize_shift_type("day"),
                        shift_rate=_parse_shift_rate(sh.get("shiftRate")),
                    )
                db.add(assignment)
                db.flush()
                from app.services import shift_adjustment_service
                shift_adjustment_service.apply_planner_adjustments(
                    db, user_id, company.id, assignment, sh.get("adjustments") or []
                )
                scheduled = (sh.get("scheduledStart") or "").strip()
                att_key = f"{emp_id}:{dk}:{idx}"
                att_rec = (data.get("attendance") or {}).get(att_key) or {}
                late_m = int(att_rec.get("lateMinutes") or 0)
                if late_m <= 0 and scheduled and sh.get("start") and scheduled != sh.get("start"):
                    late_m = max(
                        0,
                        shift_adjustment_service._parse_mins(sh.get("start"))
                        - shift_adjustment_service._parse_mins(scheduled),
                    )
                if late_m > 0:
                    start = sh.get("start") or ""
                    sched = scheduled or shift_adjustment_service._mins_to_time(
                        shift_adjustment_service._parse_mins(start) - late_m
                    )
                    shift_adjustment_service.apply_planner_lateness(
                        db, user_id, company.id, assignment, sched, late_m, att_rec.get("note")
                    )
                raw_status = str(att_rec.get("status") or "").strip().lower().replace(" ", "_")
                status = "on_time" if raw_status == "present" else raw_status
                if status in {"on_time", "late", "absent", "no_show", "early_leave"}:
                    marked = Attendance(
                        assignment_id=assignment.id,
                        guard_id=emp_guard_id,
                        status=status,
                        note=(att_rec.get("note") or "").strip() or None,
                        updated_by_user_id=user_id,
                    )
                    if status in {"on_time", "late"}:
                        marked.booked_at = datetime.now(timezone.utc)
                    db.add(marked)
                created += 1

    published_ids = _published_guard_ids(db, plan.id)
    if published_ids:
        plan.status = "published"
        plan.published_at = datetime.now(timezone.utc)
    else:
        plan.status = "draft"
        plan.published_at = None
    db.commit()

    after_fp = rota_notify_service.fingerprint_from_assignments(db, plan.id, guard_id)
    changes = rota_notify_service.diff_shift_fingerprints(before_fp, after_fp)
    if changes:
        shift_audit_service.log_publish_changes(
            db, company_id=company.id, user_id=user_id, plan=plan, changes=changes, published=True
        )
        db.commit()
        rota_notify_service.notify_shift_changes(db, user_id, plan, changes)

    return RotaPlanPublishResult(
        created=created, skipped=skipped, errors=errors, published_guard_ids=published_ids
    )


def unpublish_rota_plan_guard(
    db: Session, user_id: int, plan_id: int, guard_id: int
) -> RotaPlanPublishResult:
    _block_portal_roles(db, user_id)
    company = get_company_by_user_id(db, user_id)
    plan = db.query(RotaPlan).filter(RotaPlan.id == plan_id, RotaPlan.company_id == company.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Rota not found")
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Staff not found")

    from app.services import rota_notify_service

    before_fp = rota_notify_service.fingerprint_from_assignments(db, plan.id, guard_id)
    _delete_plan_assignments(db, plan.id, guard_id)
    published_ids = _published_guard_ids(db, plan.id)
    if published_ids:
        plan.status = "published"
    else:
        plan.status = "draft"
        plan.published_at = None
    db.commit()
    changes = rota_notify_service.diff_shift_fingerprints(before_fp, set())
    if changes:
        shift_audit_service.log_publish_changes(
            db, company_id=company.id, user_id=user_id, plan=plan, changes=changes, published=False
        )
        db.commit()
        rota_notify_service.notify_shift_changes(db, user_id, plan, changes)
    return RotaPlanPublishResult(
        created=0, skipped=0, errors=[], published_guard_ids=published_ids
    )


def unpublish_rota_plan(db: Session, user_id: int, plan_id: int) -> RotaPlanPublishResult:
    """Unpublish the entire rota (remove all published assignments)."""
    _block_portal_roles(db, user_id)
    company = get_company_by_user_id(db, user_id)
    plan = db.query(RotaPlan).filter(RotaPlan.id == plan_id, RotaPlan.company_id == company.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Rota not found")
    from app.services import rota_notify_service

    before_fp = rota_notify_service.fingerprint_from_assignments(db, plan.id)
    _delete_plan_assignments(db, plan.id)
    plan.status = "draft"
    plan.published_at = None
    db.commit()
    changes = rota_notify_service.diff_shift_fingerprints(before_fp, set())
    if changes:
        shift_audit_service.log_publish_changes(
            db, company_id=company.id, user_id=user_id, plan=plan, changes=changes, published=False
        )
        db.commit()
        rota_notify_service.notify_shift_changes(db, user_id, plan, changes)
    return RotaPlanPublishResult(created=0, skipped=0, errors=[], published_guard_ids=[])
