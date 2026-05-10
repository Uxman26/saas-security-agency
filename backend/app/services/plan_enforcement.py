from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Company, Guard, Site
from app.plan_config import LIMITS, feature_enabled, normalize_tier, quota_guards, quota_sites


def check_contractors_feature(db: Session, company_id: int) -> None:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    if not feature_enabled(co.subscription_tier, "contractors"):
        raise HTTPException(
            status_code=422,
            detail="Contractors are not available on your subscription tier.",
        )


def check_sub_contractors_feature(db: Session, company_id: int) -> None:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    if not feature_enabled(co.subscription_tier, "sub_contractors"):
        raise HTTPException(
            status_code=422,
            detail="Sub-contractors are not available on your subscription tier.",
        )


def enforce_guard_quota(db: Session, company: Company) -> None:
    tier = normalize_tier(company.subscription_tier)
    cap = quota_guards(tier)
    if cap is None:
        return
    n = db.query(Guard).filter(Guard.company_id == company.id).count()
    if n >= cap:
        raise HTTPException(
            status_code=403,
            detail=f"Your plan allows up to {cap} guards. Upgrade to add more.",
        )


def enforce_site_quota(db: Session, company: Company) -> None:
    tier = normalize_tier(company.subscription_tier)
    cap = quota_sites(tier)
    if cap is None:
        return
    n = db.query(Site).filter(Site.company_id == company.id).count()
    if n >= cap:
        raise HTTPException(
            status_code=403,
            detail=f"Your plan allows up to {cap} sites. Upgrade to add more.",
        )


def enforce_feature(company: Company, key: str) -> None:
    if not feature_enabled(company.subscription_tier, key):
        raise HTTPException(
            status_code=403,
            detail="This feature is not included in your subscription tier.",
        )


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
