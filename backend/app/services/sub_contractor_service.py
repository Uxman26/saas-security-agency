from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from app.models import SubContractor
from app.schemas import SubContractorCreate
from app.services.company_service import get_company_by_user_id
from app.services.plan_enforcement import enforce_feature


def _subs_feature(company):
    enforce_feature(company, "subcontractors")


def create_sub_contractor(db: Session, sub_contractor: SubContractorCreate, user_id: int) -> SubContractor:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    db_sub_contractor = SubContractor(**sub_contractor.dict(), company_id=company.id)
    db.add(db_sub_contractor)
    db.commit()
    db.refresh(db_sub_contractor)
    return db_sub_contractor

def get_sub_contractors(db: Session, user_id: int) -> List[SubContractor]:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    return db.query(SubContractor).filter(SubContractor.company_id == company.id).all()

def get_sub_contractor_by_id(db: Session, sub_contractor_id: int, user_id: int) -> SubContractor:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    sub_contractor = db.query(SubContractor).filter(SubContractor.id == sub_contractor_id, SubContractor.company_id == company.id).first()
    if not sub_contractor:
        raise HTTPException(status_code=404, detail="Sub-contractor not found")
    return sub_contractor

def update_sub_contractor(db: Session, sub_contractor_id: int, sub_contractor: SubContractorCreate, user_id: int) -> SubContractor:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    db_sub_contractor = db.query(SubContractor).filter(SubContractor.id == sub_contractor_id, SubContractor.company_id == company.id).first()
    if not db_sub_contractor:
        raise HTTPException(status_code=404, detail="Sub-contractor not found")
    
    for key, value in sub_contractor.dict().items():
        setattr(db_sub_contractor, key, value)
    
    db.commit()
    db.refresh(db_sub_contractor)
    return db_sub_contractor

def delete_sub_contractor(db: Session, sub_contractor_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    sub_contractor = db.query(SubContractor).filter(SubContractor.id == sub_contractor_id, SubContractor.company_id == company.id).first()
    if not sub_contractor:
        raise HTTPException(status_code=404, detail="Sub-contractor not found")
    
    db.delete(sub_contractor)
    db.commit()
