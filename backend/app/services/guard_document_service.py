from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
from app.models import GuardDocument, Guard
from app.schemas import GuardDocumentCreate
from app.services.company_service import get_company_by_user_id

def get_all_documents(db: Session, user_id: int, guard_id: Optional[int] = None) -> List[GuardDocument]:
    company = get_company_by_user_id(db, user_id)
    q = db.query(GuardDocument).join(Guard).filter(Guard.company_id == company.id)
    if guard_id:
        q = q.filter(GuardDocument.guard_id == guard_id)
    return q.order_by(GuardDocument.created_at.desc()).all()

def create_document(db: Session, guard_id: int, doc: GuardDocumentCreate, user_id: int) -> GuardDocument:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    data = doc.model_dump() if hasattr(doc, "model_dump") else doc.dict()
    db_doc = GuardDocument(guard_id=guard_id, **data)
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc

def get_documents(db: Session, guard_id: int, user_id: int) -> List[GuardDocument]:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    return db.query(GuardDocument).filter(GuardDocument.guard_id == guard_id).all()

def get_expiring(db: Session, user_id: int, days: int = 30) -> List[GuardDocument]:
    company = get_company_by_user_id(db, user_id)
    from datetime import timedelta
    cutoff = date.today() + timedelta(days=days)
    return db.query(GuardDocument).join(Guard).filter(
        Guard.company_id == company.id,
        GuardDocument.expiry_date != None,
        GuardDocument.expiry_date <= cutoff
    ).all()

def delete_document(db: Session, doc_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    doc = db.query(GuardDocument).join(Guard).filter(
        GuardDocument.id == doc_id,
        Guard.company_id == company.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
