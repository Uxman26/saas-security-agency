from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import User, Company
from app.schemas import UserCreate
from app.auth import get_password_hash, create_access_token
from datetime import timedelta
from app.config import settings

def create_user_and_company(db: Session, user_data: UserCreate) -> User:
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        password_hash=hashed_password,
        full_name=user_data.full_name
    )
    db.add(user)
    db.flush()
    
    company = Company(name=user_data.company_name, admin_id=user.id)
    db.add(company)
    db.commit()
    db.refresh(user)
    
    return user

def authenticate_user(db: Session, email: str, password: str) -> dict:
    from app.auth import verify_password
    
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.id}, expires_delta=access_token_expires
    )
    return {"access_token": str(access_token), "token_type": "bearer"}
