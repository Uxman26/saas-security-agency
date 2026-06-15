import os
import shutil
from typing import Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models import Company, User
from app.schemas import CompanyProfileUpdate
from app.services.company_service import get_company_by_user_id
from app.storage_paths import LOGOS_DIR, ensure_upload_dirs, resolve_storage_path

ALLOWED_LOGO_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def company_logo_url(company: Company) -> Optional[str]:
    if resolve_storage_path(company.logo_path):
        return "/auth/company-logo"
    return None


def account_logo_url(company: Company) -> Optional[str]:
    if resolve_storage_path(company.account_logo_path):
        return "/auth/account-logo"
    return None


def get_company_profile(db: Session, user_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    admin = db.query(User).filter(User.id == company.admin_id).first()
    return {
        "id": company.id,
        "name": company.name,
        "email": company.email or (admin.email if admin else None),
        "phone": company.phone,
        "address": company.address,
        "logo_url": company_logo_url(company),
        "account_name": company.account_name,
        "account_details": company.account_details,
        "account_logo_url": account_logo_url(company),
    }


def update_company_profile(db: Session, user_id: int, data: CompanyProfileUpdate) -> dict:
    company = get_company_by_user_id(db, user_id)
    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        if hasattr(company, k):
            setattr(company, k, v)
    db.commit()
    db.refresh(company)
    return get_company_profile(db, user_id)


def save_company_logo(db: Session, user_id: int, file: UploadFile) -> dict:
    company = get_company_by_user_id(db, user_id)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_LOGO_EXT:
        raise HTTPException(status_code=400, detail="Use PNG, JPG, WEBP or GIF")
    ensure_upload_dirs()
    dest = os.path.join(LOGOS_DIR, f"company_{company.id}{ext}")
    old = resolve_storage_path(company.logo_path)
    if old and old != dest and os.path.isfile(old):
        try:
            os.remove(old)
        except OSError:
            pass
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)
    company.logo_path = dest
    db.commit()
    db.refresh(company)
    return get_company_profile(db, user_id)


def save_account_logo(db: Session, user_id: int, file: UploadFile) -> dict:
    company = get_company_by_user_id(db, user_id)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_LOGO_EXT:
        raise HTTPException(status_code=400, detail="Use PNG, JPG, WEBP or GIF")
    ensure_upload_dirs()
    dest = os.path.join(LOGOS_DIR, f"company_{company.id}_account{ext}")
    old = resolve_storage_path(company.account_logo_path)
    if old and old != dest and os.path.isfile(old):
        try:
            os.remove(old)
        except OSError:
            pass
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)
    company.account_logo_path = dest
    db.commit()
    db.refresh(company)
    return get_company_profile(db, user_id)
