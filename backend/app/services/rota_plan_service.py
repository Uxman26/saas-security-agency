import json
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import Assignment, Guard, RotaPlan, Site
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
    return RotaPlanListItem(
        id=plan.id,
        name=plan.name,
        start_date=plan.start_date,
        end_date=plan.end_date,
        day_count=plan.day_count,
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


def get_rota_plan(db: Session, user_id: int, plan_id: int) -> RotaPlanDetail:
    company = get_company_by_user_id(db, user_id)
    plan = db.query(RotaPlan).filter(RotaPlan.id == plan_id, RotaPlan.company_id == company.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Rota not found")
    base = _to_list_item(db, plan)
    return RotaPlanDetail(**base.model_dump(), planner_data=plan.planner_data)


_AVATAR_PALETTE = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#f97316"]
_SHIFT_COLOR_OPTS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899"]
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
        employees.append(
            {
                "id": eid,
                "name": pe.get("name") or be.get("name") or "",
                "role": pe.get("role") or be.get("role") or "Staff",
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


def copy_rota_plan(db: Session, user_id: int, source_id: int, data: RotaPlanCopy) -> RotaPlanDetail:
    company = get_company_by_user_id(db, user_id)
    source = db.query(RotaPlan).filter(RotaPlan.id == source_id, RotaPlan.company_id == company.id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source rota not found")

    day_count = max(1, min(90, data.day_count if data.day_count is not None else source.day_count))
    payload = _extract_payload(db, source)
    remapped = _remap_payload(payload, source.start_date, source.day_count, data.start_date, day_count)
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
    if "name" in payload and payload["name"]:
        plan.name = payload["name"].strip()
    if "view_mode" in payload and payload["view_mode"]:
        plan.view_mode = payload["view_mode"]
    if "budget" in payload and payload["budget"] is not None:
        plan.budget = float(payload["budget"])
    if "planner_data" in payload:
        plan.planner_data = payload["planner_data"]
    if "status" in payload and payload["status"]:
        plan.status = payload["status"]
    db.commit()
    db.refresh(plan)
    return get_rota_plan(db, user_id, plan.id)


def delete_rota_plan(db: Session, user_id: int, plan_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    plan = db.query(RotaPlan).filter(RotaPlan.id == plan_id, RotaPlan.company_id == company.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Rota not found")
    db.query(Assignment).filter(Assignment.rota_plan_id == plan.id).delete()
    db.delete(plan)
    db.commit()


def publish_rota_plan(db: Session, user_id: int, plan_id: int) -> RotaPlanPublishResult:
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

    sites = db.query(Site).filter(Site.company_id == company.id).all()
    site_by_name = {s.name.strip().lower(): s.id for s in sites}

    db.query(Assignment).filter(Assignment.rota_plan_id == plan.id).delete()

    created = 0
    skipped = 0
    errors: list[str] = []
    shifts = data.get("shifts") or {}

    for emp_id, by_d in shifts.items():
        try:
            guard_id = int(emp_id)
        except (TypeError, ValueError):
            skipped += 1
            continue
        guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
        if not guard:
            skipped += 1
            errors.append(f"Staff {emp_id} not found")
            continue
        for dk, day_shifts in (by_d or {}).items():
            for sh in day_shifts or []:
                site_key = (sh.get("site") or "").strip().lower()
                site_id = site_by_name.get(site_key)
                if not site_id:
                    skipped += 1
                    errors.append(
                        f'No site named "{sh.get("site")}" ({dk})' if site_key else f"Missing site on {dk}"
                    )
                    continue
                break_m = int(sh.get("breakM") or 0) + int(sh.get("breakH") or 0) * 60
                db.add(
                    Assignment(
                        guard_id=guard_id,
                        site_id=site_id,
                        rota_plan_id=plan.id,
                        date=date.fromisoformat(dk),
                        shift_start=sh.get("start"),
                        shift_end=sh.get("end"),
                        break_minutes=break_m,
                        shift_type=normalize_shift_type("day"),
                    )
                )
                created += 1

    plan.status = "published"
    plan.published_at = datetime.now(timezone.utc)
    db.commit()
    return RotaPlanPublishResult(created=created, skipped=skipped, errors=errors)
