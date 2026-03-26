from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from app.models import Guard, GuardDocument, Payroll, Assignment, Attendance
from app.schemas import DashboardStats, ComplianceAlert
from app.services.company_service import get_company_by_user_id

def get_dashboard_stats(db: Session, user_id: int) -> DashboardStats:
    company = get_company_by_user_id(db, user_id)
    active_guards = db.query(Guard).filter(Guard.company_id == company.id).count()
    cutoff = date.today() + timedelta(days=30)
    expiring = db.query(GuardDocument).join(Guard).filter(
        Guard.company_id == company.id,
        GuardDocument.expiry_date != None,
        GuardDocument.expiry_date <= cutoff
    ).count()
    rev = db.query(func.coalesce(func.sum(func.coalesce(Payroll.bank_amount, 0) + func.coalesce(Payroll.cash_amount, 0)), 0)).filter(Payroll.company_id == company.id).scalar() or 0
    late_count = db.query(Attendance).join(Assignment).join(Guard).filter(
        Guard.company_id == company.id,
        Attendance.status == "late"
    ).count()
    today = date.today()
    upcoming = db.query(Assignment).join(Guard).filter(
        Guard.company_id == company.id,
        Assignment.date >= today,
        Assignment.date <= today + timedelta(days=7)
    ).count()
    return DashboardStats(
        active_guards=active_guards,
        expiring_documents=expiring,
        revenue_total=float(rev),
        late_count=late_count,
        upcoming_shifts=upcoming
    )

def get_compliance_alerts(db: Session, user_id: int, days: int = 30) -> list:
    company = get_company_by_user_id(db, user_id)
    cutoff = date.today() + timedelta(days=days)
    rows = db.query(GuardDocument, Guard).join(Guard).filter(
        Guard.company_id == company.id,
        GuardDocument.expiry_date != None,
        GuardDocument.expiry_date <= cutoff
    ).order_by(GuardDocument.expiry_date).all()
    return [
        ComplianceAlert(
            guard_id=g.id,
            guard_name=g.full_name,
            document_type=d.document_type,
            expiry_date=d.expiry_date
        )
        for d, g in rows
    ]
