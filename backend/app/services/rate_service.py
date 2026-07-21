from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
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

def _guard_rate_for_date(db: Session, guard_id: int, site_id: Optional[int], shift_type: str, d: date) -> Optional[float]:
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
