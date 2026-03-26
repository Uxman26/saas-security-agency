from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User, Company
from app.schemas import CompanyResponse
from app.auth import get_current_super_admin

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/companies", response_model=List[CompanyResponse])
def list_all_companies(db: Session = Depends(get_db), _: User = Depends(get_current_super_admin)):
    return db.query(Company).order_by(Company.id).all()
