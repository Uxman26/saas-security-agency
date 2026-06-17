from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Guard
from app.services.company_service import get_company_by_user_id
from app.services.rota_service import list_rota_details, rota_summary


def _committed_hours(guard: Optional[Guard], start_date: date, end_date: date) -> float:
    days = (end_date - start_date).days + 1
    if days < 1:
        days = 1
    wh = float(guard.weekly_contracted_hours) if guard and guard.weekly_contracted_hours is not None else 40.0
    return round(wh * (days / 7.0), 2)


def _all_employee_rows(db: Session, company_id: int, start_date: date, end_date: date, summary_rows) -> list[dict]:
    summary_map = {r.guard_id: r.model_dump() for r in summary_rows}
    guards = db.query(Guard).filter(Guard.company_id == company_id).order_by(Guard.full_name).all()
    rows = []
    for g in guards:
        if g.id in summary_map:
            rows.append(summary_map[g.id])
        else:
            rows.append(
                {
                    "guard_id": g.id,
                    "guard_name": g.full_name,
                    "total_hours": 0.0,
                    "late_arrivals": 0,
                    "overtime_hours": 0.0,
                    "committed_hours": _committed_hours(g, start_date, end_date),
                }
            )
    return rows


def staff_individual_report(db: Session, user_id: int, guard_id: int, start_date: date, end_date: date) -> dict:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        return {}
    details = list_rota_details(db, user_id, start_date, end_date, guard_id=guard_id)
    today = date.today()
    scheduled = sum(1 for d in details if d.date >= today or d.attendance_status == "scheduled")
    completed = sum(1 for d in details if d.date < today and d.attendance_status in ("on_time", "late", "absent"))
    total_hours = round(sum(d.hours for d in details), 2)
    summary = rota_summary(db, user_id, start_date, end_date, guard_id=guard_id)
    ot = summary[0].overtime_hours if summary else 0
    att = {
        "on_time": sum(1 for d in details if d.attendance_status == "on_time"),
        "late": sum(1 for d in details if d.attendance_status == "late"),
        "absent": sum(1 for d in details if d.attendance_status == "absent"),
        "scheduled": sum(1 for d in details if d.attendance_status == "scheduled"),
        "pending": sum(1 for d in details if d.attendance_status == "pending"),
    }
    return {
        "guard_id": guard_id,
        "guard_name": guard.full_name,
        "period_start": start_date,
        "period_end": end_date,
        "total_shifts": len(details),
        "scheduled_shifts": scheduled,
        "completed_shifts": completed,
        "total_hours": total_hours,
        "overtime_hours": ot,
        "attendance_summary": att,
        "shifts": [d.model_dump() for d in details],
    }


def staff_monthly_report(
    db: Session,
    user_id: int,
    start_date: date,
    end_date: date,
    group_by: str = "guard",
) -> dict:
    company = get_company_by_user_id(db, user_id)
    details = list_rota_details(db, user_id, start_date, end_date)
    summary_rows = rota_summary(db, user_id, start_date, end_date)
    by_employee = _all_employee_rows(db, company.id, start_date, end_date, summary_rows)
    site_map: dict[str, dict] = {}
    client_map: dict[str, dict] = {}
    for d in details:
        if group_by == "site":
            key = d.site_name or str(d.site_id)
        elif group_by == "client":
            key = d.client_name or "Unknown"
        else:
            continue
        bucket_store = site_map if group_by == "site" else client_map
        if key not in bucket_store:
            bucket_store[key] = {"key": key, "total_shifts": 0, "total_hours": 0.0, "guards": set()}
        bucket = bucket_store[key]
        bucket["total_shifts"] += 1
        bucket["total_hours"] = round(bucket["total_hours"] + d.hours, 2)
        bucket["guards"].add(d.guard_name)
    grouped = []
    for v in (site_map if group_by == "site" else client_map).values():
        grouped.append({**v, "guard_count": len(v["guards"]), "guards": sorted(v["guards"])})
    grouped.sort(key=lambda x: x["total_hours"], reverse=True)
    workforce_hours = round(sum(r["total_hours"] for r in by_employee), 2)
    return {
        "period_start": start_date,
        "period_end": end_date,
        "group_by": group_by,
        "by_employee": by_employee,
        "grouped_summary": grouped,
        "workforce_total_hours": workforce_hours,
        "total_employees": len(by_employee),
    }


def shift_hours_report(db: Session, user_id: int, start_date: date, end_date: date) -> dict:
    company = get_company_by_user_id(db, user_id)
    details = list_rota_details(db, user_id, start_date, end_date)
    summary_rows = rota_summary(db, user_id, start_date, end_date)
    by_employee = _all_employee_rows(db, company.id, start_date, end_date, summary_rows)
    shift_rows = [
        {
            "guard": d.guard_name,
            "site": d.site_name,
            "date": d.date.isoformat(),
            "shift": f"{d.shift_start}-{d.shift_end}",
            "hours": d.hours,
            "status": d.attendance_status,
        }
        for d in details
    ]
    return {
        "period_start": start_date,
        "period_end": end_date,
        "by_employee": by_employee,
        "shifts": shift_rows,
        "total_shifts": len(shift_rows),
        "workforce_total_hours": round(sum(r["total_hours"] for r in by_employee), 2),
        "total_employees": len(by_employee),
    }


def attendance_report_rows(db: Session, user_id: int, start_date: date, end_date: date, guard_id: Optional[int] = None) -> list[dict]:
    details = list_rota_details(db, user_id, start_date, end_date, guard_id=guard_id)
    return [
        {
            "guard": d.guard_name,
            "site": d.site_name,
            "date": d.date.isoformat(),
            "shift": f"{d.shift_start}-{d.shift_end}",
            "hours": d.hours,
            "status": d.attendance_status,
            "late_minutes": d.late_minutes or "",
        }
        for d in details
    ]
