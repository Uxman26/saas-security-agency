import json
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import Assignment, Attendance, Guard, RotaPlan, Site
from app.schemas import RotaPlanCopy, RotaPlanCreate, RotaPlanDetail, RotaPlanListItem, RotaPlanPublishResult, RotaPlanUpdate
from app.services.company_service import get_company_by_user_id
from app.services.rota_service import normalize_shift_type


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


def list_rota_plans(db: Session, user_id: int) -> List[RotaPlanListItem]:
    company = get_company_by_user_id(db, user_id)
    rows = (
        db.query(RotaPlan)
        .filter(RotaPlan.company_id == company.id)
        .order_by(RotaPlan.created_at.desc())
        .all()
    )
    return [_to_list_item(db, p) for p in rows]


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
    base = _to_list_item(db, plan)
    return RotaPlanDetail(
        **base.model_dump(),
        planner_data=plan.planner_data,
        published_guard_ids=_published_guard_ids(db, plan.id),
    )


def _normalize_shift(block: dict, idx: int = 0) -> dict:
    b = dict(block or {})
    color = (b.get("color") or "").strip()
    if not color:
        color = _SHIFT_COLOR_OPTS[idx % len(_SHIFT_COLOR_OPTS)]
    return {
        "start": b.get("start") or "09:00",
        "end": b.get("end") or "17:00",
        "site": b.get("site") or "",
        "notes": b.get("notes") or "",
        "breakH": int(b.get("breakH") or 0),
        "breakM": int(b.get("breakM") or 0),
        "color": color,
        "label": b.get("label") or "",
        "shiftRate": _parse_shift_rate(b.get("shiftRate")),
        "scheduledEnd": b.get("scheduledEnd") or "",
        "adjustments": b.get("adjustments") or [],
    }


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


def _payload_from_assignments(db: Session, plan: RotaPlan, planner: Optional[dict] = None) -> dict:
    lookup = _planner_shift_lookup(planner)
    rows = (
        db.query(Assignment)
        .options(joinedload(Assignment.guard), joinedload(Assignment.site))
        .filter(Assignment.rota_plan_id == plan.id)
        .order_by(Assignment.date, Assignment.id)
        .all()
    )
    days = _day_keys(plan.start_date, plan.day_count)
    employees: dict[str, dict] = {}
    shifts: dict[str, dict[str, list]] = {}
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
        shifts.setdefault(eid, {}).setdefault(dk, []).append(_normalize_shift(base, shift_idx))
        shift_idx += 1
    return {
        "rotaView": (planner or {}).get("rotaView") or plan.view_mode or "table",
        "days": list((planner or {}).get("days") or days),
        "employees": list(employees.values()),
        "shifts": shifts,
        "attendance": dict((planner or {}).get("attendance") or {}),
        "budget": float((planner or {}).get("budget") if (planner or {}).get("budget") is not None else plan.budget or 0),
        "inclBreaks": bool((planner or {}).get("inclBreaks", False)),
    }


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


def create_rota_plan(db: Session, user_id: int, data: RotaPlanCreate) -> RotaPlanDetail:
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
    db.commit()
    db.refresh(plan)
    return get_rota_plan(db, user_id, plan.id)


def update_rota_plan(db: Session, user_id: int, plan_id: int, data: RotaPlanUpdate) -> RotaPlanDetail:
    company = get_company_by_user_id(db, user_id)
    plan = db.query(RotaPlan).filter(RotaPlan.id == plan_id, RotaPlan.company_id == company.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Rota not found")
    payload = data.model_dump(exclude_unset=True)
    was_published = plan.status == "published"
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
    db.commit()
    if "planner_data" in payload:
        if was_published:
            from app.services import attendance_service, rota_notify_service, shift_adjustment_service

            try:
                new_data = json.loads(plan.planner_data or "{}")
            except json.JSONDecodeError:
                new_data = {}
            before_fp = rota_notify_service.fingerprint_from_assignments(db, plan.id)
            after_fp = rota_notify_service.fingerprint_from_planner_shifts(new_data.get("shifts"))
            if before_fp != after_fp:
                # Structural shift change → auto-republish + staff notifications
                publish_rota_plan(db, user_id, plan.id, guard_id=None)
            else:
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
    company = get_company_by_user_id(db, user_id)
    plan = db.query(RotaPlan).filter(RotaPlan.id == plan_id, RotaPlan.company_id == company.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Rota not found")
    _delete_plan_assignments(db, plan.id)
    db.delete(plan)
    db.commit()


def publish_rota_plan(
    db: Session, user_id: int, plan_id: int, guard_id: Optional[int] = None
) -> RotaPlanPublishResult:
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

    _delete_plan_assignments(db, plan.id, guard_id)

    created = 0
    skipped = 0
    errors: list[str] = []
    shifts = data.get("shifts") or {}

    for emp_id, by_d in shifts.items():
        try:
            emp_guard_id = int(emp_id)
        except (TypeError, ValueError):
            skipped += 1
            continue
        if guard_id is not None and emp_guard_id != guard_id:
            continue
        guard = db.query(Guard).filter(Guard.id == emp_guard_id, Guard.company_id == company.id).first()
        if not guard:
            skipped += 1
            errors.append(f"Staff {emp_id} not found")
            continue
        for dk, day_shifts in (by_d or {}).items():
            for idx, sh in enumerate(day_shifts or []):
                site_key = (sh.get("site") or "").strip().lower()
                site_id = site_by_name.get(site_key)
                if not site_id:
                    skipped += 1
                    errors.append(
                        f'No site named "{sh.get("site")}" ({dk})' if site_key else f"Missing site on {dk}"
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
        rota_notify_service.notify_shift_changes(db, user_id, plan, changes)

    return RotaPlanPublishResult(
        created=created, skipped=skipped, errors=errors, published_guard_ids=published_ids
    )


def unpublish_rota_plan_guard(
    db: Session, user_id: int, plan_id: int, guard_id: int
) -> RotaPlanPublishResult:
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
        rota_notify_service.notify_shift_changes(db, user_id, plan, changes)
    return RotaPlanPublishResult(
        created=0, skipped=0, errors=[], published_guard_ids=published_ids
    )


def unpublish_rota_plan(db: Session, user_id: int, plan_id: int) -> RotaPlanPublishResult:
    """Unpublish the entire rota (remove all published assignments)."""
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
        rota_notify_service.notify_shift_changes(db, user_id, plan, changes)
    return RotaPlanPublishResult(created=0, skipped=0, errors=[], published_guard_ids=[])
