from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.schemas import DashboardOverview, ComplianceAlert, ContractExpiryAlert
from app.rbac import require_perm, PERM_REP_READ
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])

@router.get("/dashboard", response_model=DashboardOverview)
def dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return report_service.get_dashboard_overview(db, current_user.id)

@router.get("/compliance", response_model=List[ComplianceAlert])
def compliance_alerts(days: int = 30, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return report_service.get_compliance_alerts(db, current_user.id, days)


@router.get("/contracts-expiring", response_model=List[ContractExpiryAlert])
def contracts_expiring(days: int = 30, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return report_service.get_contract_expiry_alerts(db, current_user.id, days)
