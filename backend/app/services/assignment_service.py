from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
from app.models import Assignment, Guard, Site
from app.schemas import AssignmentCreate, RotaResponse
from app.services.company_service import get_company_by_user_id
from app.services.contractor_scope import guard_has_contractor, site_has_contractor
from app.services.rota_service import normalize_shift_type

def create_assignment(db: Session, assignment: AssignmentCreate, user_id: int) -> Assignment:
    company = get_company_by_user_id(db, user_id)
    
    guard = db.query(Guard).filter(Guard.id == assignment.guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    
    site = db.query(Site).filter(Site.id == assignment.site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if not guard_has_contractor(guard) or not site_has_contractor(site):
        raise HTTPException(
            status_code=400,
            detail="Assignments require both the guard and the site to have a main or sub contractor linked.",
        )

    data = assignment.model_dump() if hasattr(assignment, "model_dump") else assignment.dict()
    data["shift_type"] = normalize_shift_type(data.get("shift_type"))
    db_assignment = Assignment(**data)
    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)
    return db_assignment

def get_assignments(
    db: Session,
    user_id: int,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    client_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> List[Assignment]:
    company = get_company_by_user_id(db, user_id)
    
    query = db.query(Assignment).join(Guard).join(Site).filter(Guard.company_id == company.id)
    
    if guard_id:
        query = query.filter(Assignment.guard_id == guard_id)
    if site_id:
        query = query.filter(Assignment.site_id == site_id)
    if client_id:
        query = query.filter(Site.client_id == client_id)
    if start_date:
        query = query.filter(Assignment.date >= start_date)
    if end_date:
        query = query.filter(Assignment.date <= end_date)
    
    return query.all()

def get_rota(
    db: Session,
    user_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    client_id: Optional[int] = None,
) -> List[RotaResponse]:
    company = get_company_by_user_id(db, user_id)
    
    query = db.query(
        Assignment.guard_id,
        Guard.full_name.label("guard_name"),
        Assignment.site_id,
        Site.name.label("site_name"),
        Assignment.date,
        Assignment.shift_start,
        Assignment.shift_end,
        Assignment.break_minutes,
        Assignment.shift_type
    ).join(Guard).join(Site).filter(Guard.company_id == company.id)
    if guard_id:
        query = query.filter(Assignment.guard_id == guard_id)
    if site_id:
        query = query.filter(Assignment.site_id == site_id)
    if client_id:
        query = query.filter(Site.client_id == client_id)
    if start_date:
        query = query.filter(Assignment.date >= start_date)
    if end_date:
        query = query.filter(Assignment.date <= end_date)
    results = query.all()
    return [
        RotaResponse(
            guard_id=r.guard_id,
            guard_name=r.guard_name,
            site_id=r.site_id,
            site_name=r.site_name,
            date=r.date,
            shift_start=r.shift_start,
            shift_end=r.shift_end,
            break_minutes=r.break_minutes,
            shift_type=r.shift_type
        )
        for r in results
    ]

def get_assignment_by_id(db: Session, assignment_id: int, user_id: int) -> Assignment:
    company = get_company_by_user_id(db, user_id)
    assignment = db.query(Assignment).join(Guard).filter(
        Assignment.id == assignment_id,
        Guard.company_id == company.id
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment

def update_assignment(db: Session, assignment_id: int, assignment: AssignmentCreate, user_id: int) -> Assignment:
    company = get_company_by_user_id(db, user_id)
    db_assignment = db.query(Assignment).join(Guard).filter(
        Assignment.id == assignment_id,
        Guard.company_id == company.id
    ).first()
    if not db_assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    guard = db.query(Guard).filter(Guard.id == assignment.guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    
    site = db.query(Site).filter(Site.id == assignment.site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if not guard_has_contractor(guard) or not site_has_contractor(site):
        raise HTTPException(
            status_code=400,
            detail="Assignments require both the guard and the site to have a main or sub contractor linked.",
        )

    data = assignment.model_dump() if hasattr(assignment, "model_dump") else assignment.dict()
    data["shift_type"] = normalize_shift_type(data.get("shift_type"))
    for key, value in data.items():
        setattr(db_assignment, key, value)
    
    db.commit()
    db.refresh(db_assignment)
    return db_assignment

def delete_assignment(db: Session, assignment_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    assignment = db.query(Assignment).join(Guard).filter(
        Assignment.id == assignment_id,
        Guard.company_id == company.id
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    db.delete(assignment)
    db.commit()
