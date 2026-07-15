from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
from app.models import Payroll, Guard, Site, RotaPlan
from app.schemas import PayrollCreate, PayrollUpdate, PayrollResponse
from app.services.company_service import get_company_by_user_id
from app.services.rate_service import resolve_assignment_pay_rate
from app.models import Assignment, Allowance
from app.services.rota_service import shift_hours

VALID_PAYMENT_MODES = {"100_bank", "100_cash", "split"}

def _calculate_for_assignments(
    db: Session,
    company_id: int,
    guard_id: int,
    assignments: list[Assignment],
) -> Payroll:
    total_hours = 0.0
    rate_sum = 0.0
    for a in assignments:
        hrs = shift_hours(a)
        total_hours += hrs
        r = resolve_assignment_pay_rate(db, a, company_id)
        rate_sum += r * hrs
    allowances = db.query(Allowance).filter(Allowance.company_id == company_id, Allowance.in_payroll == True).all()
    allowance_total = sum(al.amount for al in allowances)
    mode = "100_bank"
    bank = rate_sum + allowance_total
    cash = 0.0
    period_start = min(a.date for a in assignments)
    period_end = max(a.date for a in assignments)
    pr = Payroll(
        company_id=company_id,
        guard_id=guard_id,
        period_start=period_start,
        period_end=period_end,
        total_hours=total_hours,
        hourly_rate=rate_sum / total_hours if total_hours else 0,
        bank_amount=bank,
        cash_amount=cash,
        allowance_total=allowance_total,
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
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    assignments = db.query(Assignment).filter(
        Assignment.guard_id == guard_id,
        Assignment.date >= period_start,
        Assignment.date <= period_end
    ).all()
    if not assignments:
        raise HTTPException(status_code=400, detail="No assignments found for this guard in the selected period")
    pr = _calculate_for_assignments(db, company.id, guard_id, assignments)
    db.commit()
    db.refresh(pr)
    return pr


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
    q = db.query(Assignment).join(Guard).filter(
        Guard.company_id == company.id,
        Assignment.date >= period_start,
        Assignment.date <= period_end,
    )
    if mode == "employee":
        if not guard_id:
            raise HTTPException(status_code=400, detail="guard_id required for employee payroll")
        guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
        if not guard:
            raise HTTPException(status_code=404, detail="Guard not found")
        q = q.filter(Assignment.guard_id == guard_id)
    elif mode == "site":
        if not site_id:
            raise HTTPException(status_code=400, detail="site_id required for site payroll")
        site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        q = q.filter(Assignment.site_id == site_id)
    elif mode == "rota":
        if not rota_plan_id:
            raise HTTPException(status_code=400, detail="rota_plan_id required for rota payroll")
        plan = db.query(RotaPlan).filter(RotaPlan.id == rota_plan_id, RotaPlan.company_id == company.id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Rota not found")
        q = q.filter(Assignment.rota_plan_id == rota_plan_id)
    else:
        raise HTTPException(status_code=400, detail="mode must be employee, site, or rota")

    assignments = q.all()
    if not assignments:
        raise HTTPException(status_code=400, detail="No assignments found for the selected criteria and period")

    by_guard: dict[int, list[Assignment]] = {}
    for a in assignments:
        by_guard.setdefault(a.guard_id, []).append(a)

    created: list[Payroll] = []
    for gid, rows in by_guard.items():
        created.append(_calculate_for_assignments(db, company.id, gid, rows))
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
