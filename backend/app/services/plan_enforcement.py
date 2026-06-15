from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
from app.models import Company, Guard, Site, User
from app.plan_config import normalize_tier
from app.services.tenant_usage_service import user_limit_for_company


def check_contractors_feature(db: Session, company_id: int) -> None:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    # if not feature_enabled(co.subscription_tier, "contractors"):
    #     raise HTTPException(
    #         status_code=422,
    #         detail="Contractors are not available on your subscription tier.",
    #     )


def check_sub_contractors_feature(db: Session, company_id: int) -> None:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    # if not feature_enabled(co.subscription_tier, "sub_contractors"):
    #     raise HTTPException(
    #         status_code=422,
    #         detail="Sub-contractors are not available on your subscription tier.",
    #     )


def enforce_guard_quota(db: Session, company: Company) -> None:
    # tier = normalize_tier(company.subscription_tier)
    # cap = quota_guards(tier)
    # if cap is None:
    #     return
    # n = db.query(Guard).filter(Guard.company_id == company.id).count()
    # if n >= cap:
    #     raise HTTPException(
    #         status_code=403,
    #         detail=f"Your plan allows up to {cap} guards. Upgrade to add more.",
    #     )
    return


def enforce_site_quota(db: Session, company: Company) -> None:
    # tier = normalize_tier(company.subscription_tier)
    # cap = quota_sites(tier)
    # if cap is None:
    #     return
    # n = db.query(Site).filter(Site.company_id == company.id).count()
    # if n >= cap:
    #     raise HTTPException(
    #         status_code=403,
    #         detail=f"Your plan allows up to {cap} sites. Upgrade to add more.",
    #     )
    return


def enforce_feature(company: Company, key: str) -> None:
    # if not feature_enabled(company.subscription_tier, key):
    #     raise HTTPException(
    #         status_code=403,
    #         detail="This feature is not included in your subscription tier.",
    #     )
    return


def enforce_user_quota(db: Session, company: Company) -> None:
    cap = user_limit_for_company(company)
    if cap is None:
        return
    n = db.query(func.count(User.id)).filter(User.company_id == company.id, User.is_active == True).scalar()
    if int(n or 0) >= cap:
        raise HTTPException(
            status_code=403,
            detail=f"User limit reached ({cap}). Upgrade your plan to add more users.",
        )


def plan_summary(db: Session, company: Company) -> dict:
    tier = normalize_tier(company.subscription_tier)
    ug = db.query(Guard).filter(Guard.company_id == company.id).count()
    us = db.query(Site).filter(Site.company_id == company.id).count()
    uu = db.query(func.count(User.id)).filter(User.company_id == company.id, User.is_active == True).scalar()
    cap = user_limit_for_company(company)
    return {
        "tier": tier,
        "max_guards": None,
        "max_sites": None,
        "max_users": cap,
        "guards_used": ug,
        "sites_used": us,
        "users_used": int(uu or 0),
        "features": {
            "subcontractors": True,
            "extended_reports": True,
            "contractors": True,
            "sub_contractors": True,
        },
    }
