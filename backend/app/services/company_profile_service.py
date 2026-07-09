import os
from typing import Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models import Company, User
from app.schemas import CompanyProfileUpdate
from app.services.company_service import get_company_by_user_id
from app.storage_paths import LOGOS_DIR, ensure_upload_dirs, resolve_storage_path
from app.services.image_avif_service import AVIF_EXT, is_image_filename, save_upload_as_avif

ALLOWED_LOGO_EXT = {AVIF_EXT, ".png", ".jpg", ".jpeg", ".webp", ".gif"}


def company_logo_url(company: Company) -> Optional[str]:
    if resolve_storage_path(company.logo_path):
        return "/auth/company-logo"
    return None


def account_bank_lines(company: Company) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    if (company.account_name or "").strip():
        rows.append(("Account name", company.account_name.strip()))
    if (company.bank_name or "").strip():
        rows.append(("Bank", company.bank_name.strip()))
    if (company.sort_code or "").strip():
        rows.append(("Sort code", company.sort_code.strip()))
    if (company.account_number or "").strip():
        rows.append(("Account number", company.account_number.strip()))
    if (company.iban or "").strip():
        rows.append(("IBAN", company.iban.strip()))
    if (company.swift_code or "").strip():
        rows.append(("SWIFT / BIC", company.swift_code.strip()))
    return rows


def has_account_bank_details(company: Company) -> bool:
    return bool(account_bank_lines(company))


def get_company_profile(db: Session, user_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    admin = db.query(User).filter(User.id == company.admin_id).first()
    return {
        "id": company.id,
        "name": company.name,
        "email": company.email or (admin.email if admin else None),
        "phone": company.phone,
        "address": company.address,
        "postcode": company.postcode,
        "registration_number": company.registration_number,
        "vat_number": company.vat_number,
        "logo_url": company_logo_url(company),
        "account_name": company.account_name,
        "bank_name": company.bank_name,
        "sort_code": company.sort_code,
        "account_number": company.account_number,
        "iban": company.iban,
        "swift_code": company.swift_code,
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
    if ext not in ALLOWED_LOGO_EXT and not is_image_filename(file.filename):
        raise HTTPException(status_code=400, detail="Upload a valid image file (stored as AVIF)")
    ensure_upload_dirs()
    base = os.path.join(LOGOS_DIR, f"company_{company.id}")
    old = resolve_storage_path(company.logo_path)
    if old and os.path.isfile(old):
        try:
            os.remove(old)
        except OSError:
            pass
    dest, _mime = save_upload_as_avif(file.file, base)
    company.logo_path = dest
    db.commit()
    db.refresh(company)
    return get_company_profile(db, user_id)
