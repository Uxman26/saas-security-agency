from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import PERM_REP_READ, require_perm
from app.schemas import (
    DashboardOverview,
    ComplianceAlert,
    ContractExpiryAlert,
    ReportsHubResponse,
    StaffIndividualReportResponse,
    StaffMonthlyReportResponse,
    SubscriptionReportSummary,
    UsageSummaryResponse,
)
from app.services import report_service, staff_report_service, reports_hub_service, export_service, reports_extended_service, shift_adjustment_service

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


@router.get("/hub", response_model=ReportsHubResponse)
def reports_hub(start_date: date, end_date: date, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return ReportsHubResponse(**reports_hub_service.reports_hub(db, current_user.id, start_date, end_date))


@router.get("/staff/{guard_id}", response_model=StaffIndividualReportResponse)
def staff_individual(guard_id: int, start_date: date, end_date: date, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    data = staff_report_service.staff_individual_report(db, current_user.id, guard_id, start_date, end_date)
    if not data:
        raise HTTPException(status_code=404, detail="Staff not found")
    return StaffIndividualReportResponse(**data)


@router.get("/staff/shift-hours")
def staff_shift_hours(start_date: date, end_date: date, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return staff_report_service.shift_hours_report(db, current_user.id, start_date, end_date)


@router.get("/staff/monthly", response_model=StaffMonthlyReportResponse)
def staff_monthly(start_date: date, end_date: date, group_by: str = "guard", db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    if group_by not in ("guard", "site", "client"):
        group_by = "guard"
    return StaffMonthlyReportResponse(**staff_report_service.staff_monthly_report(db, current_user.id, start_date, end_date, group_by))


@router.get("/attendance")
def attendance_report(start_date: date, end_date: date, guard_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return staff_report_service.attendance_report_rows(db, current_user.id, start_date, end_date, guard_id)


@router.get("/shift-overtime")
def shift_overtime_report(start_date: date, end_date: date, guard_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return shift_adjustment_service.overtime_report_rows(db, current_user.id, start_date, end_date, guard_id)


@router.get("/shift-early-finish")
def shift_early_finish_report(start_date: date, end_date: date, guard_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return shift_adjustment_service.early_finish_report_rows(db, current_user.id, start_date, end_date, guard_id)


@router.get("/financial/invoices")
def financial_invoices(start_date: date, end_date: date, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return reports_hub_service.financial_invoice_rows(db, current_user.id, start_date, end_date)


@router.get("/subscription/summary", response_model=SubscriptionReportSummary)
def subscription_summary(db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return SubscriptionReportSummary(**reports_extended_service.subscription_summary(db, current_user.id))


@router.get("/subscription/invoices")
def subscription_invoices(start_date: date, end_date: date, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return reports_extended_service.subscription_invoice_rows(db, current_user.id, start_date, end_date)


@router.get("/usage/logins")
def usage_logins(start_date: date, end_date: date, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return reports_extended_service.login_report_rows(db, current_user.id, start_date, end_date)


@router.get("/usage/summary", response_model=UsageSummaryResponse)
def usage_summary(start_date: date, end_date: date, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_REP_READ))):
    return UsageSummaryResponse(**reports_extended_service.usage_summary(db, current_user.id, start_date, end_date))


def _export_response(data: bytes, fmt: str, filename: str):
    media = {"csv": "text/csv", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "pdf": "application/pdf"}
    return Response(data, media_type=media.get(fmt, "application/octet-stream"), headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/export/{report_type}")
def export_report(
    report_type: str,
    start_date: date,
    end_date: date,
    format: str = "csv",
    guard_id: Optional[int] = None,
    group_by: str = "guard",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_REP_READ)),
):
    fmt = format.lower()
    if fmt not in ("csv", "xlsx", "pdf"):
        raise HTTPException(status_code=400, detail="Invalid format")
    title = f"{report_type} report"
    columns: list[tuple[str, str]] = []
    rows: list[dict] = []
    if report_type == "attendance":
        rows = staff_report_service.attendance_report_rows(db, current_user.id, start_date, end_date, guard_id)
        columns = [("guard", "Guard"), ("site", "Site"), ("date", "Date"), ("shift", "Shift"), ("hours", "Hours"), ("status", "Status"), ("late_minutes", "Late mins")]
    elif report_type == "invoices":
        rows = reports_hub_service.financial_invoice_rows(db, current_user.id, start_date, end_date)
        columns = [("invoice_id", "Invoice"), ("period_end", "Period end"), ("total", "Total"), ("amount_paid", "Paid"), ("balance", "Balance"), ("status", "Status"), ("due_date", "Due")]
    elif report_type == "staff-monthly":
        data = staff_report_service.staff_monthly_report(db, current_user.id, start_date, end_date, group_by)
        rows = data["by_employee"]
        columns = [("guard_name", "Employee"), ("total_hours", "Hours"), ("late_arrivals", "Late"), ("overtime_hours", "Overtime"), ("committed_hours", "Committed")]
        title = "Monthly staff summary"
    elif report_type == "shift-hours":
        data = staff_report_service.shift_hours_report(db, current_user.id, start_date, end_date)
        rows = data["by_employee"]
        columns = [("guard_name", "Employee"), ("total_hours", "Hours"), ("late_arrivals", "Late"), ("overtime_hours", "Overtime"), ("committed_hours", "Committed")]
        title = "Shift hours summary"
    elif report_type == "shift-overtime":
        rows = shift_adjustment_service.overtime_report_rows(db, current_user.id, start_date, end_date, guard_id)
        columns = [
            ("date", "Date"),
            ("guard", "Employee"),
            ("site", "Site"),
            ("shift_start", "Start"),
            ("scheduled_end", "Scheduled end"),
            ("new_end", "New end"),
            ("extra_minutes", "Extra mins"),
            ("reason", "Reason"),
            ("recorded_by", "Recorded by"),
            ("recorded_at", "Recorded at"),
        ]
        title = "Overtime report"
    elif report_type == "shift-early-finish":
        rows = shift_adjustment_service.early_finish_report_rows(db, current_user.id, start_date, end_date, guard_id)
        columns = [
            ("date", "Date"),
            ("guard", "Employee"),
            ("site", "Site"),
            ("shift_start", "Start"),
            ("scheduled_end", "Scheduled end"),
            ("actual_end", "Actual end"),
            ("early_minutes", "Early mins"),
            ("reason", "Reason"),
            ("recorded_by", "Recorded by"),
            ("recorded_at", "Recorded at"),
        ]
        title = "Finished early report"
    elif report_type == "login-logs":
        rows = reports_extended_service.login_report_rows(db, current_user.id, start_date, end_date)
        columns = [("login_at", "Login at"), ("email", "Email"), ("full_name", "Name"), ("status", "Status"), ("ip_address", "IP")]
        title = "Login activity"
    elif report_type == "subscription":
        rows = reports_extended_service.subscription_invoice_rows(db, current_user.id, start_date, end_date)
        columns = [("invoice_number", "Invoice"), ("tier", "Plan"), ("total", "Total"), ("amount_paid", "Paid"), ("status", "Status"), ("due_date", "Due")]
        title = "Subscription invoices"
    elif report_type == "sms":
        from app.services import sms_service
        logs = sms_service.list_sms_logs(db, current_user.id, 500)
        rows = [
            {"recipient": l.recipient, "status": l.status, "sent_at": l.sent_at.isoformat() if l.sent_at else "", "body": (l.body or "")[:80]}
            for l in logs
            if l.sent_at and start_date <= l.sent_at.date() <= end_date
        ]
        columns = [("sent_at", "Sent"), ("recipient", "Recipient"), ("status", "Status"), ("body", "Message")]
        title = "SMS logs"
    else:
        raise HTTPException(status_code=404, detail="Unknown report type")
    if fmt == "csv":
        body = export_service.to_csv(rows, columns)
    elif fmt == "xlsx":
        body = export_service.to_xlsx(rows, columns, report_type)
    else:
        body = export_service.to_pdf_table(title, rows, columns)
    return _export_response(body, fmt, f"{report_type}-{start_date}-{end_date}.{fmt}")
