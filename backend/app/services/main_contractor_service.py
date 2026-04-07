from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from app.models import MainContractor, SubContractor, Guard, Site
from app.schemas import MainContractorCreate
from app.services.company_service import get_company_by_user_id
from app.services.plan_enforcement import enforce_feature


def _subs_feature(company):
    enforce_feature(company, "subcontractors")


def create_main_contractor(db: Session, body: MainContractorCreate, user_id: int) -> MainContractor:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    data = body.model_dump() if hasattr(body, "model_dump") else body.dict()
    row = MainContractor(**data, company_id=company.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_main_contractors(db: Session, user_id: int) -> List[MainContractor]:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    return db.query(MainContractor).filter(MainContractor.company_id == company.id).order_by(MainContractor.name).all()


def get_main_contractor_by_id(db: Session, main_id: int, user_id: int) -> MainContractor:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    row = db.query(MainContractor).filter(MainContractor.id == main_id, MainContractor.company_id == company.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Main contractor not found")
    return row


def update_main_contractor(db: Session, main_id: int, body: MainContractorCreate, user_id: int) -> MainContractor:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    row = db.query(MainContractor).filter(MainContractor.id == main_id, MainContractor.company_id == company.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Main contractor not found")
    data = body.model_dump() if hasattr(body, "model_dump") else body.dict()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_main_contractor(db: Session, main_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    row = db.query(MainContractor).filter(MainContractor.id == main_id, MainContractor.company_id == company.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Main contractor not found")
    if db.query(SubContractor).filter(SubContractor.main_contractor_id == main_id).first():
        raise HTTPException(status_code=400, detail="Delete or reassign sub-contractors under this main contractor first.")
    if db.query(Guard).filter(Guard.main_contractor_id == main_id).first():
        raise HTTPException(status_code=400, detail="Reassign or remove guards linked to this main contractor first.")
    if db.query(Site).filter(Site.main_contractor_id == main_id).first():
        raise HTTPException(status_code=400, detail="Reassign or remove sites linked to this main contractor first.")
    db.delete(row)
    db.commit()
