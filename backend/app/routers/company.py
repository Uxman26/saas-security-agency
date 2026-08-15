from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module
from app.schemas import CompanyProfileResponse, CompanyProfileUpdate
from app.services import company_profile_service

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
