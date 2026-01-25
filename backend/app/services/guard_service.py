from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from app.models import Guard
from app.schemas import GuardCreate
from app.services.company_service import get_company_by_user_id

def create_guard(db: Session, guard: GuardCreate, user_id: int) -> Guard:
    company = get_company_by_user_id(db, user_id)
    
    if guard.badge_number and db.query(Guard).filter(Guard.badge_number == guard.badge_number).first():
        raise HTTPException(status_code=400, detail="Badge number already exists")
    
    db_guard = Guard(**guard.dict(), company_id=company.id)
    db.add(db_guard)
    db.commit()
    db.refresh(db_guard)
    return db_guard

def get_guards(db: Session, user_id: int) -> List[Guard]:
    company = get_company_by_user_id(db, user_id)
    return db.query(Guard).filter(Guard.company_id == company.id).all()

def get_guard_by_id(db: Session, guard_id: int, user_id: int) -> Guard:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    return guard

def update_guard(db: Session, guard_id: int, guard: GuardCreate, user_id: int) -> Guard:
    company = get_company_by_user_id(db, user_id)
    db_guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not db_guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    
    if guard.badge_number and guard.badge_number != db_guard.badge_number:
        if db.query(Guard).filter(Guard.badge_number == guard.badge_number).first():
            raise HTTPException(status_code=400, detail="Badge number already exists")
    
    for key, value in guard.dict().items():
        setattr(db_guard, key, value)
    
    db.commit()
    db.refresh(db_guard)
    return db_guard

def delete_guard(db: Session, guard_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    
    db.delete(guard)
    db.commit()
