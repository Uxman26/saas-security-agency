import json
from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
from app.models import Payroll, Guard, Site, RotaPlan
from app.schemas import PayrollCreate, PayrollUpdate, PayrollResponse
from app.services.company_service import get_company_by_user_id

VALID_PAYMENT_MODES = {"100_bank", "100_cash", "split"}

def _number(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _hours_from_shift(shift: dict, include_breaks: bool) -> float:
    def mins(raw: str) -> int:
        try:
            hour, minute = str(raw or "00:00").split(":")[:2]
            return int(hour) * 60 + int(minute)
        except (TypeError, ValueError):
            return 0

    duration = mins(shift.get("end")) - mins(shift.get("start"))
    if duration < 0:
        duration += 24 * 60
    if not include_breaks:
        duration -= int(shift.get("breakH") or 0) * 60 + int(shift.get("breakM") or 0)
    return max(0.0, duration / 60)


def _planner_payroll_lines(plan: RotaPlan) -> list[dict]:
    try:
        payload = json.loads(plan.planner_data or "{}")
    except (json.JSONDecodeError, TypeError):
        return []

    stored = payload.get("payrollLines")
    if isinstance(stored, list):
        return [line for line in stored if isinstance(line, dict)]

    # Compatibility for rotas saved before payroll snapshots were introduced.
    lines: list[dict] = []
    attendance = payload.get("attendance") or {}
    include_breaks = bool(payload.get("inclBreaks", False))
    for guard_id, by_date in (payload.get("shifts") or {}).items():
        for day, shifts in (by_date or {}).items():
            for index, shift in enumerate(shifts or []):
                if not isinstance(shift, dict):
                    continue
                record = attendance.get(f"{guard_id}:{day}:{index}") or {}
                status = str(record.get("status") or "").strip().lower().replace(" ", "_")
                if status == "present":
                    status = "on_time"
                if status not in {"on_time", "late"}:
                    continue
                raw_hours = record.get("hours")
                hours = _number(raw_hours, -1)
                if hours < 0:
                    hours = _hours_from_shift(shift, include_breaks)
                rate = _number(shift.get("shiftRate"))
                lines.append(
                    {
                        "guardId": str(guard_id),
                        "date": str(day),
                        "site": shift.get("site") or "",
                        "hours": hours,
                        "rate": rate,
                        "amount": hours * rate,
                        "status": status,
                    }
                )
    return lines


def _create_from_rota_lines(
    db: Session,
    company_id: int,
    guard_id: int,
    lines: list[dict],
    period_start: date,
    period_end: date,
) -> Payroll:
    total_hours = sum(max(0.0, _number(line.get("hours"))) for line in lines)
    total_amount = sum(max(0.0, _number(line.get("amount"))) for line in lines)
    if total_hours <= 0:
        raise HTTPException(status_code=400, detail="No payable rota hours found for this employee")
    mode = "100_bank"
    pr = Payroll(
        company_id=company_id,
        guard_id=guard_id,
        period_start=period_start,
        period_end=period_end,
        total_hours=total_hours,
        hourly_rate=total_amount / total_hours,
        bank_amount=total_amount,
        cash_amount=0.0,
        allowance_total=0.0,
        payment_mode=mode,
    )
    db.add(pr)
    return pr

def create_payroll(db: Session, data: PayrollCreate, user_id: int) -> Payroll:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == data.guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    pr = Payroll(company_id=company.id, **payload)
    db.add(pr)
    db.commit()
    db.refresh(pr)
    return pr

def get_payrolls(db: Session, user_id: int, guard_id: Optional[int] = None, period_start: Optional[date] = None, period_end: Optional[date] = None) -> List[Payroll]:
    company = get_company_by_user_id(db, user_id)
    q = db.query(Payroll).filter(Payroll.company_id == company.id)
    if guard_id:
        q = q.filter(Payroll.guard_id == guard_id)
    if period_start:
        q = q.filter(Payroll.period_end >= period_start)
    if period_end:
        q = q.filter(Payroll.period_start <= period_end)
    return q.order_by(Payroll.period_end.desc()).all()

def get_payroll(db: Session, payroll_id: int, user_id: int) -> Payroll:
    company = get_company_by_user_id(db, user_id)
    pr = db.query(Payroll).filter(Payroll.id == payroll_id, Payroll.company_id == company.id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Payroll not found")
    return pr

def calculate_payroll(db: Session, guard_id: int, period_start: date, period_end: date, user_id: int) -> Payroll:
    rows = calculate_payroll_batch(
        db,
        user_id,
        period_start,
        period_end,
        "employee",
        guard_id=guard_id,
    )
    return rows[0]


def calculate_payroll_batch(
    db: Session,
    user_id: int,
    period_start: date,
    period_end: date,
    mode: str,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    rota_plan_id: Optional[int] = None,
) -> List[Payroll]:
    company = get_company_by_user_id(db, user_id)
    mode = (mode or "employee").lower().strip()
    if period_start > period_end:
        raise HTTPException(status_code=400, detail="period_start cannot be after period_end")

    plans_query = db.query(RotaPlan).filter(
        RotaPlan.company_id == company.id,
        RotaPlan.status == "published",
        RotaPlan.end_date >= period_start,
        RotaPlan.start_date <= period_end,
    )
    selected_site_name: Optional[str] = None
    if mode == "employee":
        if not guard_id:
            raise HTTPException(status_code=400, detail="guard_id required for employee payroll")
        guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
        if not guard:
            raise HTTPException(status_code=404, detail="Guard not found")
    elif mode == "site":
        if not site_id:
            raise HTTPException(status_code=400, detail="site_id required for site payroll")
        site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        selected_site_name = (site.name or "").strip().lower()
    elif mode == "rota":
        if not rota_plan_id:
            raise HTTPException(status_code=400, detail="rota_plan_id required for rota payroll")
        plan = db.query(RotaPlan).filter(RotaPlan.id == rota_plan_id, RotaPlan.company_id == company.id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Rota not found")
        if plan.status != "published":
            raise HTTPException(status_code=400, detail="Publish the rota before creating payroll")
        plans_query = plans_query.filter(RotaPlan.id == rota_plan_id)
    else:
        raise HTTPException(status_code=400, detail="mode must be employee, site, or rota")

    by_guard: dict[int, list[dict]] = {}
    for plan in plans_query.all():
        for line in _planner_payroll_lines(plan):
            try:
                line_date = date.fromisoformat(str(line.get("date")))
                line_guard_id = int(line.get("guardId"))
            except (TypeError, ValueError):
                continue
            if line_date < period_start or line_date > period_end:
                continue
            if mode == "employee" and line_guard_id != guard_id:
                continue
            if mode == "site" and (str(line.get("site") or "").strip().lower() != selected_site_name):
                continue
            by_guard.setdefault(line_guard_id, []).append(line)

    if not by_guard:
        raise HTTPException(
            status_code=400,
            detail="No payable On time or Late shifts found in published rota data for the selected period",
        )

    created: list[Payroll] = []
    for gid, lines in by_guard.items():
        guard = db.query(Guard).filter(Guard.id == gid, Guard.company_id == company.id).first()
        if not guard:
            continue
        created.append(
            _create_from_rota_lines(
                db,
                company.id,
                gid,
                lines,
                period_start,
                period_end,
            )
        )
    if not created:
        raise HTTPException(status_code=400, detail="No valid employee payroll records could be created")
    db.commit()
    for pr in created:
        db.refresh(pr)
    return created

def delete_payroll(db: Session, payroll_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    pr = db.query(Payroll).filter(Payroll.id == payroll_id, Payroll.company_id == company.id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Payroll not found")
    db.delete(pr)
    db.commit()

def update_payroll(db: Session, payroll_id: int, data: PayrollUpdate, user_id: int) -> Payroll:
    company = get_company_by_user_id(db, user_id)
    pr = db.query(Payroll).filter(Payroll.id == payroll_id, Payroll.company_id == company.id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Payroll not found")
    payload = data.model_dump(exclude_unset=True) if hasattr(data, "model_dump") else data.dict(exclude_unset=True)
    if "payment_mode" in payload and payload["payment_mode"] is not None:
        mode = str(payload["payment_mode"]).strip().lower()
        if mode not in VALID_PAYMENT_MODES:
            raise HTTPException(status_code=400, detail="payment_mode must be 100_bank, 100_cash, or split")
        payload["payment_mode"] = mode
    if "period_start" in payload and "period_end" in payload:
        if payload["period_start"] and payload["period_end"] and payload["period_start"] > payload["period_end"]:
            raise HTTPException(status_code=400, detail="period_start cannot be after period_end")
    elif "period_start" in payload and payload["period_start"] and pr.period_end and payload["period_start"] > pr.period_end:
        raise HTTPException(status_code=400, detail="period_start cannot be after period_end")
    elif "period_end" in payload and payload["period_end"] and pr.period_start and payload["period_end"] < pr.period_start:
        raise HTTPException(status_code=400, detail="period_end cannot be before period_start")
    for field in ("total_hours", "hourly_rate", "bank_amount", "cash_amount", "allowance_total"):
        if field in payload and payload[field] is not None and payload[field] < 0:
            raise HTTPException(status_code=400, detail=f"{field} cannot be negative")
    for k, v in payload.items():
        setattr(pr, k, v)
    # Keep bank/cash consistent with payment mode when mode changes and amounts not both provided
    mode = pr.payment_mode or "100_bank"
    base = float(pr.total_hours or 0) * float(pr.hourly_rate or 0) + float(pr.allowance_total or 0)
    if mode == "100_bank" and "bank_amount" not in payload and "cash_amount" not in payload:
        pr.bank_amount = base
        pr.cash_amount = 0.0
    elif mode == "100_cash" and "bank_amount" not in payload and "cash_amount" not in payload:
        pr.cash_amount = base
        pr.bank_amount = 0.0
    db.commit()
    db.refresh(pr)
    return pr
