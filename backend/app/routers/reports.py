from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.schemas import DashboardStats, ComplianceAlert
from app.auth import get_current_user
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])

@router.get("/dashboard", response_model=DashboardStats)
def dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return report_service.get_dashboard_stats(db, current_user.id)

@router.get("/compliance", response_model=List[ComplianceAlert])
def compliance_alerts(days: int = 30, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return report_service.get_compliance_alerts(db, current_user.id, days)
