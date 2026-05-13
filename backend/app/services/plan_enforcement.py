from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Company, Guard, Site
from app.plan_config import LIMITS, normalize_tier


def check_contractors_feature(db: Session, company_id: int) -> None:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")


def check_sub_contractors_feature(db: Session, company_id: int) -> None:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")


def enforce_guard_quota(db: Session, company: Company) -> None:
    return


def enforce_site_quota(db: Session, company: Company) -> None:
    return


def enforce_feature(company: Company, key: str) -> None:
    return


def plan_summary(db: Session, company: Company) -> dict:
    tier = normalize_tier(company.subscription_tier)
    lim = LIMITS[tier]
    ug = db.query(Guard).filter(Guard.company_id == company.id).count()
    us = db.query(Site).filter(Site.company_id == company.id).count()
    return {
        "tier": tier,
        "max_guards": lim["max_guards"],
        "max_sites": lim["max_sites"],
        "guards_used": ug,
        "sites_used": us,
        "features": dict(lim["features"]),
    }
