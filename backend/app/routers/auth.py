import os
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Company
from app.schemas import UserCreate, UserResponse, UserLogin, UserMeResponse, SignupResponse, SubscriptionReceiptResponse
from app.auth import get_current_user, SUPER_ADMIN_ROLE
from app.services import auth_service
from app.rbac import permissions_for_user_db
from app.services.plan_enforcement import plan_summary
from app.services.receipt_service import parse_sidebar_modules
router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    user, receipt = auth_service.signup_with_receipt(db, user_data)
    co = db.query(Company).filter(Company.id == user.company_id).first()
    return SignupResponse(
        user=UserResponse.model_validate(user),
        receipt=SubscriptionReceiptResponse(
            id=receipt.id,
            ref_id=receipt.ref_id,
            company_id=receipt.company_id,
            company_name=co.name if co else None,
            user_email=user.email,
            subscription_tier=receipt.subscription_tier,
            amount=receipt.amount,
            period_days=receipt.period_days,
            status=receipt.status,
            period_start=receipt.period_start,
            period_end=receipt.period_end,
            paid_at=receipt.paid_at,
            created_at=receipt.created_at,
        ),
    )

@router.post("/login")
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    return auth_service.authenticate_user(db, credentials.email, credentials.password)

@router.get("/me", response_model=UserMeResponse)
def get_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    perms = permissions_for_user_db(db, current_user)
    plan = None
    company_name = None
    logo_url = None
    co = None
    if current_user.company_id:
        co = db.query(Company).filter(Company.id == current_user.company_id).first()
        if co:
            plan = plan_summary(db, co)
            company_name = co.name
            if co.logo_path and os.path.isfile(co.logo_path):
                logo_url = "/auth/company-logo"
    sub_status = None
    sub_end = None
    sidebar_modules = None
    if current_user.company_id and co:
        sub_status = co.subscription_status
        sub_end = co.subscription_end
    if getattr(current_user, "role", None) != SUPER_ADMIN_ROLE:
        sidebar_modules = parse_sidebar_modules(current_user.sidebar_modules_json)
    base = UserResponse.model_validate(current_user)
    return UserMeResponse(
        **base.model_dump(),
        permissions=perms,
        plan=plan,
        company_name=company_name,
        logo_url=logo_url,
        subscription_status=sub_status,
        subscription_end=sub_end,
        sidebar_modules=sidebar_modules,
    )


@router.get("/company-logo")
def company_logo(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.company_id:
        raise HTTPException(status_code=404, detail="No company")
    co = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not co or not co.logo_path or not os.path.isfile(co.logo_path):
        raise HTTPException(status_code=404, detail="Logo not found")
    return FileResponse(co.logo_path)
