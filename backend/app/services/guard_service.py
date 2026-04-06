from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from app.models import Guard
from app.schemas import GuardCreate
from app.services.company_service import get_company_by_user_id
from app.services.plan_enforcement import enforce_guard_quota
from app.services import audit_service


def _payload(guard: GuardCreate) -> dict:
    return guard.model_dump() if hasattr(guard, "model_dump") else guard.dict()


def create_guard(db: Session, guard: GuardCreate, user_id: int) -> Guard:
    company = get_company_by_user_id(db, user_id)
    enforce_guard_quota(db, company)
    data = _payload(guard)
    if data.get("badge_number") and db.query(Guard).filter(Guard.badge_number == data["badge_number"]).first():
        raise HTTPException(status_code=400, detail="Badge number already exists")
    db_guard = Guard(**data, company_id=company.id)
    db.add(db_guard)
    db.flush()
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="create",
        entity_type="guard",
        entity_id=db_guard.id,
        meta={"full_name": data.get("full_name")},
    )
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
    data = _payload(guard)
    if data.get("badge_number") and data["badge_number"] != db_guard.badge_number:
        if db.query(Guard).filter(Guard.badge_number == data["badge_number"]).first():
            raise HTTPException(status_code=400, detail="Badge number already exists")
    for key, value in data.items():
        setattr(db_guard, key, value)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="update",
        entity_type="guard",
        entity_id=guard_id,
    )
    db.commit()
    db.refresh(db_guard)
    return db_guard

def delete_guard(db: Session, guard_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="delete",
        entity_type="guard",
        entity_id=guard_id,
    )
    db.delete(guard)
    db.commit()
