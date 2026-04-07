from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
from app.models import Payroll, Guard
from app.schemas import PayrollCreate, PayrollResponse
from app.services.company_service import get_company_by_user_id
from app.services.rate_service import resolve_pay_rate
from app.models import Assignment, Allowance
from app.services.rota_service import shift_hours

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
    total_hours = 0.0
    rate_sum = 0.0

    for a in assignments:
        hrs = shift_hours(a)
        total_hours += hrs
        r = resolve_pay_rate(db, company.id, guard_id, a.site_id, a.shift_type or "day", a.date)
        rate_sum += r * hrs
    allowances = db.query(Allowance).filter(Allowance.company_id == company.id, Allowance.in_payroll == True).all()
    allowance_total = sum(al.amount for al in allowances)
    mode = "100_bank"
    bank = rate_sum + allowance_total
    cash = 0.0
    pr = Payroll(
        company_id=company.id,
        guard_id=guard_id,
        period_start=period_start,
        period_end=period_end,
        total_hours=total_hours,
        hourly_rate=rate_sum / total_hours if total_hours else 0,
        bank_amount=bank,
        cash_amount=cash,
        allowance_total=allowance_total,
        payment_mode=mode
    )
    db.add(pr)
    db.commit()
    db.refresh(pr)
    return pr

def delete_payroll(db: Session, payroll_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    pr = db.query(Payroll).filter(Payroll.id == payroll_id, Payroll.company_id == company.id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Payroll not found")
    db.delete(pr)
    db.commit()
