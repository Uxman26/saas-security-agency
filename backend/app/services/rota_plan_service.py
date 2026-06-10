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
_SHIFT_COLOR = "#3b82f6"


def _day_keys(start: date, day_count: int) -> list[str]:
    n = max(1, day_count)
    return [(start + timedelta(days=i)).isoformat() for i in range(n)]


def _payload_from_assignments(db: Session, plan: RotaPlan) -> dict:
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
    for a in rows:
        if not a.guard:
            continue
        eid = str(a.guard_id)
        if eid not in employees:
            idx = len(employees)
            employees[eid] = {
                "id": eid,
                "name": a.guard.full_name,
                "role": a.guard.job_title or "Staff",
                "avatarColor": _AVATAR_PALETTE[idx % len(_AVATAR_PALETTE)],
            }
        dk = a.date.isoformat()
        if dk not in days:
            continue
        bm = int(a.break_minutes or 0)
        sh = {
            "start": a.shift_start or "09:00",
            "end": a.shift_end or "17:00",
            "site": (a.site.name if a.site else "") or "",
            "notes": "",
            "breakH": bm // 60,
            "breakM": bm % 60,
            "color": _SHIFT_COLOR,
            "label": "",
        }
        shifts.setdefault(eid, {}).setdefault(dk, []).append(sh)
    return {
        "rotaView": plan.view_mode or "table",
        "days": days,
        "employees": list(employees.values()),
        "shifts": shifts,
        "attendance": {},
        "budget": float(plan.budget or 0),
        "inclBreaks": False,
    }


def _extract_payload(db: Session, plan: RotaPlan) -> dict:
    if plan.planner_data:
        try:
            data = json.loads(plan.planner_data)
            if isinstance(data, dict) and (data.get("shifts") or data.get("employees") or data.get("days")):
                return data
        except json.JSONDecodeError:
            pass
    built = _payload_from_assignments(db, plan)
    if built.get("shifts") or built.get("employees"):
        return built
    if plan.planner_data:
        try:
            data = json.loads(plan.planner_data)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    return built


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
                emp_map[new_dk] = [dict(b) for b in blocks]
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
    return out


def copy_rota_plan(db: Session, user_id: int, source_id: int, data: RotaPlanCopy) -> RotaPlanDetail:
    company = get_company_by_user_id(db, user_id)
    source = db.query(RotaPlan).filter(RotaPlan.id == source_id, RotaPlan.company_id == company.id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source rota not found")

    day_count = max(1, min(90, data.day_count if data.day_count is not None else source.day_count))
    payload = _extract_payload(db, source)
    remapped = _remap_payload(payload, source.start_date, source.day_count, data.start_date, day_count)

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
