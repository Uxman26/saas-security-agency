import os
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Company, Guard, User, SmsLog, EmailLog, ApiUsageLog, LoginLog
from app.plan_config import quota_users
from app.services.module_service import parse_modules
from app.storage_paths import UPLOADS_DIR


def _dir_size(path: str) -> int:
    total = 0
    if not os.path.isdir(path):
        return 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def user_limit_for_company(company: Company) -> Optional[int]:
    if company.max_users is not None:
        return company.max_users
    return quota_users(company.subscription_tier)


def company_usage(db: Session, company_id: int) -> dict[str, Any]:
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        return {}
    active_users = (
        db.query(func.count(User.id))
        .filter(User.company_id == company_id, User.is_active == True)
        .scalar()
    )
    guards = db.query(func.count(Guard.id)).filter(Guard.company_id == company_id).scalar()
    limit = user_limit_for_company(co)
    storage_bytes = _dir_size(UPLOADS_DIR)
    sms = db.query(func.count(SmsLog.id)).filter(SmsLog.company_id == company_id).scalar()
    emails = db.query(func.count(EmailLog.id)).filter(EmailLog.company_id == company_id).scalar()
    api = db.query(func.count(ApiUsageLog.id)).filter(ApiUsageLog.company_id == company_id).scalar()
    logins = db.query(func.count(LoginLog.id)).filter(LoginLog.company_id == company_id, LoginLog.status == "success").scalar()
    return {
        "company_id": company_id,
        "active_users": int(active_users or 0),
        "max_users": limit,
        "user_slots_remaining": None if limit is None else max(0, limit - int(active_users or 0)),
        "guards_count": int(guards or 0),
        "storage_bytes": storage_bytes,
        "storage_mb": round(storage_bytes / (1024 * 1024), 2),
        "database_records": int(active_users or 0) + int(guards or 0),
        "api_requests": int(api or 0),
        "email_sent": int(emails or 0),
        "whatsapp_sent": int(sms or 0),
        "mobile_app_sessions": int(logins or 0),
        "enabled_modules": parse_modules(co.enabled_modules_json),
        "billing_cycle": co.billing_cycle or "monthly",
    }


def platform_usage_summary(db: Session) -> dict[str, Any]:
    companies = db.query(Company).count()
    users = db.query(func.count(User.id)).filter(User.company_id.isnot(None), User.is_active == True).scalar()
    storage_bytes = _dir_size(UPLOADS_DIR)
    return {
        "total_companies": companies,
        "total_active_users": int(users or 0),
        "storage_bytes": storage_bytes,
        "storage_mb": round(storage_bytes / (1024 * 1024), 2),
        "api_requests": 0,
        "email_sent": 0,
        "whatsapp_sent": 0,
        "mobile_app_sessions": 0,
    }
