from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from app.models import SubContractor, MainContractor, Guard, Site
from app.schemas import SubContractorCreate
from app.services.company_service import get_company_by_user_id
from app.services.plan_enforcement import enforce_feature


def _subs_feature(company):
    enforce_feature(company, "subcontractors")


def _reg_value(data: dict) -> Optional[str]:
    r = data.get("registration_number")
    if r:
        return r
    return data.get("license_number")


def create_sub_contractor(db: Session, body: SubContractorCreate, user_id: int) -> SubContractor:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    data = body.model_dump() if hasattr(body, "model_dump") else body.dict()
    main_id = data.pop("main_contractor_id")
    if not main_id:
        raise HTTPException(status_code=400, detail="Sub-contractors must be linked to a main contractor.")
    main = db.query(MainContractor).filter(MainContractor.id == main_id, MainContractor.company_id == company.id).first()
    if not main:
        raise HTTPException(status_code=400, detail="Main contractor not found")
    reg = _reg_value(data)
    data.pop("license_number", None)
    row = SubContractor(
        **data,
        company_id=company.id,
        main_contractor_id=main_id,
        registration_number=reg,
        license_number=reg,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_sub_contractors(db: Session, user_id: int, main_contractor_id: Optional[int] = None) -> List[SubContractor]:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    q = db.query(SubContractor).filter(SubContractor.company_id == company.id)
    if main_contractor_id is not None:
        q = q.filter(SubContractor.main_contractor_id == main_contractor_id)
    return q.order_by(SubContractor.name).all()


def get_sub_contractor_by_id(db: Session, sub_contractor_id: int, user_id: int) -> SubContractor:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    sub_contractor = db.query(SubContractor).filter(SubContractor.id == sub_contractor_id, SubContractor.company_id == company.id).first()
    if not sub_contractor:
        raise HTTPException(status_code=404, detail="Sub-contractor not found")
    return sub_contractor


def update_sub_contractor(db: Session, sub_contractor_id: int, body: SubContractorCreate, user_id: int) -> SubContractor:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    db_sub = db.query(SubContractor).filter(SubContractor.id == sub_contractor_id, SubContractor.company_id == company.id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Sub-contractor not found")
    data = body.model_dump() if hasattr(body, "model_dump") else body.dict()
    main_id = data.pop("main_contractor_id")
    if not main_id:
        raise HTTPException(status_code=400, detail="Sub-contractors must be linked to a main contractor.")
    main = db.query(MainContractor).filter(MainContractor.id == main_id, MainContractor.company_id == company.id).first()
    if not main:
        raise HTTPException(status_code=400, detail="Main contractor not found")
    reg = _reg_value(data)
    data.pop("license_number", None)
    for key, value in data.items():
        setattr(db_sub, key, value)
    db_sub.main_contractor_id = main_id
    if reg is not None:
        db_sub.registration_number = reg
        db_sub.license_number = reg
    db.commit()
    db.refresh(db_sub)
    return db_sub


def delete_sub_contractor(db: Session, sub_contractor_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    _subs_feature(company)
    sub_contractor = db.query(SubContractor).filter(SubContractor.id == sub_contractor_id, SubContractor.company_id == company.id).first()
    if not sub_contractor:
        raise HTTPException(status_code=404, detail="Sub-contractor not found")
    if db.query(Guard).filter(Guard.sub_contractor_id == sub_contractor_id).first():
        raise HTTPException(status_code=400, detail="Reassign or remove guards linked to this sub-contractor first.")
    if db.query(Site).filter(Site.sub_contractor_id == sub_contractor_id).first():
        raise HTTPException(status_code=400, detail="Reassign or remove sites linked to this sub-contractor first.")
    db.delete(sub_contractor)
    db.commit()
