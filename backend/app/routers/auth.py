from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Company
from app.schemas import UserCreate, UserResponse, UserLogin, UserMeResponse
from app.auth import get_current_user
from app.services import auth_service
from app.rbac import permissions_for_user_db
from app.services.plan_enforcement import plan_summary

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    return auth_service.create_user_and_company(db, user_data)

@router.post("/login")
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    return auth_service.authenticate_user(db, credentials.email, credentials.password)

@router.get("/me", response_model=UserMeResponse)
def get_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    perms = permissions_for_user_db(db, current_user)
    plan = None
    if current_user.company_id:
        co = db.query(Company).filter(Company.id == current_user.company_id).first()
        if co:
            plan = plan_summary(db, co)
    base = UserResponse.model_validate(current_user)
    return UserMeResponse(**base.model_dump(), permissions=perms, plan=plan)
