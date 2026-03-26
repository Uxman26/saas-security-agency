from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Company, User

def get_company_by_user_id(db: Session, user_id: int) -> Company:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    company = db.query(Company).filter(Company.id == user.company_id).first() if user.company_id else db.query(Company).filter(Company.admin_id == user_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company
