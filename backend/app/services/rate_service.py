from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
import re
from app.models import GuardRate, SiteRate, Guard, Site, Assignment
from app.schemas import GuardRateCreate, SiteRateCreate
from app.services.company_service import get_company_by_user_id

def _site_staff_rate(site: Optional[Site]) -> Optional[float]:
    if not site:
        return None
    if site.staff_hourly_rate is not None:
        return site.staff_hourly_rate
    if site.default_hourly_rate is not None:
        return site.default_hourly_rate
    return None

_HOURLY = re.compile(r"hour|\bhr\b|\bp/?h\b", re.I)

def profile_hourly_rate(guard: Optional[Guard]) -> Optional[float]:
    if not guard:
        return None
    pay_type = (getattr(guard, "employment_pay_type", None) or "").strip().lower()
    method = (getattr(guard, "pay_method", None) or "").strip().lower()
    if pay_type == "salaried":
        return salaried_hourly_rate(guard)
    if method == "per_job":
        return None
    hr = getattr(guard, "hourly_rate", None)
    if hr is not None and float(hr) > 0:
        return float(hr)
    if not guard.salary_amount or guard.salary_amount <= 0:
        return None
    return guard.salary_amount if _HOURLY.search(guard.salary_rate or "") else None


def salaried_hourly_rate(guard: Guard) -> Optional[float]:
    salary = float(getattr(guard, "salary_amount", None) or 0)
    if salary <= 0:
        return None
    weekly = float(getattr(guard, "weekly_contracted_hours", None) or 0)
    if weekly <= 0:
        hrs = float(getattr(guard, "contracted_week_hrs", None) or 0)
        mins = float(getattr(guard, "contracted_week_mins", None) or 0)
        weekly = hrs + mins / 60.0
    if weekly <= 0:
        return None
    freq = (getattr(guard, "salary_frequency", None) or getattr(guard, "pay_frequency", None) or "annual").lower()
    if "week" in freq:
        annual = salary * 52
    elif "month" in freq:
        annual = salary * 12
    else:
        annual = salary
    return round(annual / (weekly * 52), 4)


def profile_per_job_rate(guard: Optional[Guard]) -> Optional[float]:
    if not guard:
        return None
    if (getattr(guard, "employment_pay_type", None) or "").strip().lower() != "non_salaried":
        return None
    if (getattr(guard, "pay_method", None) or "").strip().lower() != "per_job":
        return None
    rate = getattr(guard, "per_job_rate", None)
    if rate is None or float(rate) < 0:
        return None
    return float(rate)


def resolve_shift_pay(
    db: Session,
    company_id: int,
    *,
    guard_id: int,
    site_id: Optional[int],
    shift_type: str,
    shift_date: date,
    hours: float,
    locked_shift_rate: Optional[float] = None,
) -> dict:
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company_id).first()
    job = profile_per_job_rate(guard)
    if job is not None:
        rate = float(locked_shift_rate) if locked_shift_rate is not None and float(locked_shift_rate) > 0 else job
        return {"rate": rate, "amount": round(rate, 2), "basis": "per_job", "hours": hours}
    if locked_shift_rate is not None and float(locked_shift_rate) > 0:
        rate = float(locked_shift_rate)
        return {
            "rate": rate,
            "amount": round(max(0.0, hours) * rate, 2),
            "basis": "shift_rate",
            "hours": hours,
        }
    hourly = profile_hourly_rate(guard)
    if hourly is not None and hourly > 0:
        basis = "salaried" if (getattr(guard, "employment_pay_type", None) or "").lower() == "salaried" else "hourly"
        return {"rate": hourly, "amount": round(max(0.0, hours) * hourly, 2), "basis": basis, "hours": hours}
    rate = resolve_pay_rate(db, company_id, guard_id, site_id or 0, shift_type or "day", shift_date)
    return {
        "rate": float(rate or 0),
        "amount": round(max(0.0, hours) * float(rate or 0), 2),
        "basis": "fallback",
        "hours": hours,
    }

def _guard_rate_for_date(db: Session, guard_id: int, site_id: Optional[int], shift_type: str, d: date) -> Optional[float]:
    profile = profile_hourly_rate(db.query(Guard).filter(Guard.id == guard_id).first())
    if profile is not None:
        return profile
    gr = db.query(GuardRate).filter(
        GuardRate.guard_id == guard_id,
        GuardRate.effective_from <= d
    ).order_by(GuardRate.effective_from.desc()).first()
    if gr:
        return gr.hourly_rate
    if site_id:
        sr = db.query(SiteRate).filter(
            SiteRate.site_id == site_id,
            SiteRate.shift_type == shift_type
        ).first()
        if sr:
            return sr.hourly_rate
        site = db.query(Site).filter(Site.id == site_id).first()
        return _site_staff_rate(site)
    return None

def _billing_rate_for_site(db: Session, company_id: int, site_id: int, shift_type: str) -> Optional[float]:
    st = shift_type or "day"
    sr = db.query(SiteRate).filter(SiteRate.site_id == site_id, SiteRate.shift_type == st).first()
    if sr:
        return sr.hourly_rate
    site = db.query(Site).filter(Site.id == site_id, Site.company_id == company_id).first()
    if site and site.default_hourly_rate is not None:
        return site.default_hourly_rate
    return None

def resolve_pay_rate(db: Session, company_id: int, guard_id: int, site_id: int, shift_type: str, d: date) -> float:
    r = _guard_rate_for_date(db, guard_id, site_id, shift_type or "day", d)
    if r is not None:
        return r
    site = db.query(Site).filter(Site.id == site_id, Site.company_id == company_id).first()
    staff = _site_staff_rate(site)
    if staff is not None:
        return staff
    gr = db.query(GuardRate).filter(GuardRate.guard_id == guard_id).order_by(GuardRate.effective_from.desc()).first()
    return gr.hourly_rate if gr else 0.0

def resolve_assignment_pay_rate(db: Session, assignment: Assignment, company_id: int) -> float:
    if assignment.shift_rate is not None:
        return assignment.shift_rate
    return resolve_pay_rate(
        db, company_id, assignment.guard_id, assignment.site_id, assignment.shift_type or "day", assignment.date
    )

def resolve_assignment_billing_rate(db: Session, assignment: Assignment, company_id: int) -> float:
    return resolve_billing_rate(
        db, company_id, assignment.guard_id, assignment.site_id, assignment.shift_type or "day", assignment.date
    )

def resolve_billing_rate(db: Session, company_id: int, guard_id: int, site_id: int, shift_type: str, d: date) -> float:
    r = _billing_rate_for_site(db, company_id, site_id, shift_type or "day")
    if r is not None:
        return r
    return resolve_pay_rate(db, company_id, guard_id, site_id, shift_type, d)

def resolve_rate(db: Session, company_id: int, guard_id: int, site_id: int, shift_type: str, d: date) -> float:
    return resolve_pay_rate(db, company_id, guard_id, site_id, shift_type, d)

def create_guard_rate(db: Session, guard_id: int, data: GuardRateCreate, user_id: int) -> GuardRate:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    rate = GuardRate(guard_id=guard_id, **payload)
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate

def get_guard_rates(db: Session, guard_id: int, user_id: int) -> List[GuardRate]:
    company = get_company_by_user_id(db, user_id)
    if not db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first():
        raise HTTPException(status_code=404, detail="Guard not found")
    return db.query(GuardRate).filter(GuardRate.guard_id == guard_id).order_by(GuardRate.effective_from.desc()).all()

def create_site_rate(db: Session, site_id: int, data: SiteRateCreate, user_id: int) -> SiteRate:
    company = get_company_by_user_id(db, user_id)
    site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    rate = SiteRate(site_id=site_id, **payload)
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate

def get_site_rates(db: Session, site_id: int, user_id: int) -> List[SiteRate]:
    company = get_company_by_user_id(db, user_id)
    if not db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first():
        raise HTTPException(status_code=404, detail="Site not found")
    return db.query(SiteRate).filter(SiteRate.site_id == site_id).all()

def delete_guard_rate(db: Session, rate_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    rate = db.query(GuardRate).join(Guard).filter(GuardRate.id == rate_id, Guard.company_id == company.id).first()
    if not rate:
        raise HTTPException(status_code=404, detail="Rate not found")
    db.delete(rate)
    db.commit()

def delete_site_rate(db: Session, rate_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    rate = db.query(SiteRate).join(Site).filter(SiteRate.id == rate_id, Site.company_id == company.id).first()
    if not rate:
        raise HTTPException(status_code=404, detail="Rate not found")
    db.delete(rate)
    db.commit()
