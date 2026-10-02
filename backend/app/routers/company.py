from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module
from app.schemas import (
    CompanyBankAccountCreate,
    CompanyBankAccountResponse,
    CompanyBankAccountUpdate,
    CompanyProfileResponse,
    CompanyProfileUpdate,
)
from app.services import company_bank_service, company_profile_service

router = APIRouter(prefix="/company", tags=["company"])


@router.get("/profile", response_model=CompanyProfileResponse)
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("billing", "view"))):
    return company_profile_service.get_company_profile(db, current_user.id)


@router.patch("/profile", response_model=CompanyProfileResponse)
def patch_profile(
    data: CompanyProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("billing", "profile_edit")),
):
    return company_profile_service.update_company_profile(db, current_user.id, data)


@router.post("/logo", response_model=CompanyProfileResponse)
def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("billing", "logo_upload")),
):
    return company_profile_service.save_company_logo(db, current_user.id, file)


@router.get("/bank-accounts", response_model=list[CompanyBankAccountResponse])
def list_bank_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("billing", "view")),
):
    company_bank_service.ensure_seeded_from_legacy(
        db, company_profile_service.get_company_entity(db, current_user.id)
    )
    return company_bank_service.list_accounts(db, current_user.id)


@router.post("/bank-accounts", response_model=CompanyBankAccountResponse, status_code=status.HTTP_201_CREATED)
def create_bank_account(
    body: CompanyBankAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("billing", "profile_edit")),
):
    return company_bank_service.create_account(db, body.model_dump(), current_user.id)


@router.put("/bank-accounts/{account_id}", response_model=CompanyBankAccountResponse)
def update_bank_account(
    account_id: int,
    body: CompanyBankAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("billing", "profile_edit")),
):
    return company_bank_service.update_account(
        db, account_id, body.model_dump(exclude_unset=True), current_user.id
    )


@router.post("/bank-accounts/{account_id}/default", response_model=CompanyBankAccountResponse)
def set_default_bank_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("billing", "profile_edit")),
):
    return company_bank_service.set_default(db, account_id, current_user.id)


@router.delete("/bank-accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bank_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("billing", "profile_edit")),
):
    company_bank_service.delete_account(db, account_id, current_user.id)
