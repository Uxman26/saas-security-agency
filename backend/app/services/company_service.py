from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Company

def get_company_by_user_id(db: Session, user_id: int) -> Company:
    company = db.query(Company).filter(Company.admin_id == user_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company
