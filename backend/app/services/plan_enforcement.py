from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
from app.models import Company, Guard, Site, User
from app.plan_config import feature_enabled, normalize_tier, quota_guards, quota_sites
from app.services.tenant_usage_service import user_limit_for_company

# RBAC module key -> plan feature / tenant module entitlement.
# Package entitlement is checked in addition to RBAC — never instead of it.
MODULE_FEATURE_KEYS = {
    "expenses": "expenses",
    "leads": "leads",
    "sms": "sms",
    "email_settings": "email",
    "client_portal": "client_portal",
    "contractors": "contractors",
    "sub_contractors": "sub_contractors",
    "reports": "extended_reports",
}

MODULE_TENANT_FLAGS = {
    "expenses": "expenses",
    "leads": "leads",
    "sms": "whatsapp",
    "email_settings": "email",
    "client_portal": "client_portal",
}


def check_contractors_feature(db: Session, company_id: int) -> None:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    if not feature_enabled(co.subscription_tier, "contractors"):
        raise HTTPException(
            status_code=403,
            detail={"code": "package_required", "message": "Contractors are not included in your current package."},
        )


def check_sub_contractors_feature(db: Session, company_id: int) -> None:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    if not feature_enabled(co.subscription_tier, "sub_contractors") and not feature_enabled(co.subscription_tier, "subcontractors"):
        raise HTTPException(
            status_code=403,
            detail={"code": "package_required", "message": "Sub-contractors are not included in your current package."},
        )


def enforce_guard_quota(db: Session, company: Company) -> None:
    tier = normalize_tier(company.subscription_tier)
    cap = quota_guards(tier)
    if cap is None:
        return
    n = db.query(Guard).filter(Guard.company_id == company.id, Guard.deleted_at.is_(None)).count()
    if n >= cap:
        raise HTTPException(
            status_code=403,
            detail={"code": "quota_exceeded", "message": f"Your plan allows up to {cap} staff. Upgrade to add more."},
        )


def enforce_site_quota(db: Session, company: Company) -> None:
    tier = normalize_tier(company.subscription_tier)
    cap = quota_sites(tier)
    if cap is None:
        return
    n = db.query(Site).filter(Site.company_id == company.id, Site.deleted_at.is_(None)).count()
    if n >= cap:
        raise HTTPException(
            status_code=403,
            detail={"code": "quota_exceeded", "message": f"Your plan allows up to {cap} sites. Upgrade to add more."},
        )


def enforce_feature(company: Company, key: str) -> None:
    if not feature_enabled(company.subscription_tier, key):
        raise HTTPException(
            status_code=403,
            detail={"code": "package_required", "message": "This feature is not included in your current package."},
        )


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


def enforce_module_entitlement(db: Session, user: User, module_key: str) -> None:
    """Reject when the tenant package does not include this module/feature.

    Called after RBAC succeeds. Super admins are not package-bound.
    """
    if getattr(user, "role", None) == "super_admin" or not user.company_id:
        return
    from app.models import Company
    from app.services.module_service import is_module_enabled

    co = db.query(Company).filter(Company.id == user.company_id).first()
    if not co:
        return
    tenant_flag = MODULE_TENANT_FLAGS.get(module_key)
    if tenant_flag:
        if not is_module_enabled(co, tenant_flag):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "package_required",
                    "message": "This module is not included in your current package. Upgrade to unlock it.",
                    "module": module_key,
                },
            )
        return
    feature_key = MODULE_FEATURE_KEYS.get(module_key)
    if not feature_key or feature_key == "extended_reports":
        return
    if not feature_enabled(co.subscription_tier, feature_key):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "package_required",
                "message": "This feature is not included in your current package.",
                "module": module_key,
            },
        )


def plan_summary(db: Session, company: Company) -> dict:
    tier = normalize_tier(company.subscription_tier)
    ug = db.query(Guard).filter(Guard.company_id == company.id, Guard.deleted_at.is_(None)).count()
    us = db.query(Site).filter(Site.company_id == company.id, Site.deleted_at.is_(None)).count()
    uu = db.query(func.count(User.id)).filter(User.company_id == company.id, User.is_active == True).scalar()
    cap = user_limit_for_company(company)
    from app.plan_config import limits_for_tier

    feats = limits_for_tier(tier).get("features") or {}
    return {
        "tier": tier,
        "max_guards": quota_guards(tier),
        "max_sites": quota_sites(tier),
        "max_users": cap,
        "guards_used": ug,
        "sites_used": us,
        "users_used": int(uu or 0),
        "features": {
            "subcontractors": bool(feats.get("subcontractors")),
            "extended_reports": bool(feats.get("extended_reports")),
            "contractors": bool(feats.get("contractors")),
            "sub_contractors": bool(feats.get("sub_contractors")),
            "expenses": bool(feats.get("expenses")),
            "leads": bool(feats.get("leads")),
            "mobile_apps": bool(feats.get("mobile_apps")),
            "client_portal": bool(feats.get("client_portal")),
            "email": bool(feats.get("email")),
            "sms": bool(feats.get("sms")),
            "api_access": bool(feats.get("api_access")),
        },
    }
