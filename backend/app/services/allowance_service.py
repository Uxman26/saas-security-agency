from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from app.models import Allowance
from app.schemas import AllowanceCreate
from app.services.company_service import get_company_by_user_id

def create_allowance(db: Session, data: AllowanceCreate, user_id: int) -> Allowance:
    company = get_company_by_user_id(db, user_id)
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    allowance = Allowance(company_id=company.id, **payload)
    db.add(allowance)
    db.commit()
    db.refresh(allowance)
    return allowance

def get_allowances(db: Session, user_id: int) -> List[Allowance]:
    company = get_company_by_user_id(db, user_id)
    return db.query(Allowance).filter(Allowance.company_id == company.id).all()

def get_allowance(db: Session, allowance_id: int, user_id: int) -> Allowance:
    company = get_company_by_user_id(db, user_id)
    a = db.query(Allowance).filter(Allowance.id == allowance_id, Allowance.company_id == company.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Allowance not found")
    return a

def update_allowance(db: Session, allowance_id: int, data: AllowanceCreate, user_id: int) -> Allowance:
    company = get_company_by_user_id(db, user_id)
    a = db.query(Allowance).filter(Allowance.id == allowance_id, Allowance.company_id == company.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Allowance not found")
    for k, v in (data.model_dump() if hasattr(data, "model_dump") else data.dict()).items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return a

def delete_allowance(db: Session, allowance_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    a = db.query(Allowance).filter(Allowance.id == allowance_id, Allowance.company_id == company.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Allowance not found")
    db.delete(a)
    db.commit()
