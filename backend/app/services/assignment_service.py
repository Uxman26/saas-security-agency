from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
from app.models import Assignment, Guard, ShiftAuditLog, Site, User
from app.schemas import AssignmentCreate, RotaResponse
from app.services import shift_audit_service
from app.services.company_service import get_company_by_user_id
from app.services.contractor_scope import guard_has_contractor, site_has_contractor
from app.services.rota_service import normalize_shift_type


def _update_action(before: dict, after: dict) -> str:
    """Name the edit after the most significant thing that moved."""
    if before.get("guard_id") != after.get("guard_id"):
        return "shift_reassigned"
    if before.get("date") != after.get("date"):
        return "shift_date_changed"
    if before.get("start") != after.get("start") or before.get("end") != after.get("end"):
        return "shift_time_changed"
    return "shift_updated"

def create_assignment(db: Session, assignment: AssignmentCreate, user_id: int) -> Assignment:
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    from app.services.portal_access import is_portal_role

    if user and is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
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
    db.flush()
    shift_audit_service.log_assignment_event(
        db,
        company_id=company.id,
        user_id=user_id,
        action="shift_assigned",
        assignment=db_assignment,
    )
    db.commit()
    db.refresh(db_assignment)
    from app.services import sms_trigger_service, email_trigger_service
    sms_trigger_service.notify_shift_assignment(db, user_id, db_assignment)
    email_trigger_service.notify_shift_assignment(db, user_id, db_assignment)
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

    user = db.query(User).filter(User.id == user_id).first()
    if user:
        from app.services.portal_access import filter_assignments_for_user, is_portal_role

        if is_portal_role(user):
            query = filter_assignments_for_user(db, user, query)
    
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
    before = shift_audit_service.snapshot_from_assignment(db_assignment)
    for key, value in data.items():
        setattr(db_assignment, key, value)

    db.flush()
    after = shift_audit_service.snapshot_from_assignment(db_assignment)
    if before != after:
        shift_audit_service.log_assignment_event(
            db,
            company_id=company.id,
            user_id=user_id,
            action=_update_action(before, after),
            assignment=db_assignment,
            before=before,
            after=after,
        )
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

    shift_audit_service.log_assignment_event(
        db,
        company_id=company.id,
        user_id=user_id,
        action="shift_deleted",
        assignment=assignment,
        before=shift_audit_service.snapshot_from_assignment(assignment),
    )
    db.query(ShiftAuditLog).filter(ShiftAuditLog.assignment_id == assignment.id).update(
        {ShiftAuditLog.assignment_id: None}, synchronize_session=False
    )
    db.delete(assignment)
    db.commit()
