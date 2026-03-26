from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserResponse, UserLogin
from app.auth import get_current_user
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    return auth_service.create_user_and_company(db, user_data)

@router.post("/login")
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    return auth_service.authenticate_user(db, credentials.email, credentials.password)

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
