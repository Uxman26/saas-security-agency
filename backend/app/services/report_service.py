from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from app.models import (
    Guard,
    GuardDocument,
    Payroll,
    Assignment,
    Attendance,
    MainContractor,
    SubContractor,
    Contractor,
    ContractorKind,
    Site,
    Client,
    Invoice,
)
from app.schemas import DashboardStats, ComplianceAlert, ChartPoint, DashboardOverview
from app.services.company_service import get_company_by_user_id
from app.services.contract_alert_service import (
    count_contracts_expiring_soon,
    notify_admin_contract_expiry,
    list_contract_expiry_alerts,
)


def _contractor_counts(db: Session, company_id: int) -> tuple[int, int, int, int]:
    dir_m = db.query(Contractor).filter(
        Contractor.company_id == company_id, Contractor.type == ContractorKind.main
    )
    dir_s = db.query(Contractor).filter(
        Contractor.company_id == company_id, Contractor.type == ContractorKind.sub
    )
    mt = dir_m.count()
    st = dir_s.count()
    ma = dir_m.filter(Contractor.is_active == True).count()
    sa = dir_s.filter(Contractor.is_active == True).count()
    if mt or st:
        return mt, ma, st, sa
    mt = db.query(MainContractor).filter(MainContractor.company_id == company_id).count()
    ma = db.query(MainContractor).filter(
        MainContractor.company_id == company_id, MainContractor.status == "active"
    ).count()
    st = db.query(SubContractor).filter(SubContractor.company_id == company_id).count()
    sa = db.query(SubContractor).filter(
        SubContractor.company_id == company_id, SubContractor.status == "active"
    ).count()
    return mt, ma, st, sa


def _shifts_by_day(db: Session, company_id: int, start: date, end: date) -> list[ChartPoint]:
    rows = (
        db.query(Assignment.date, func.count(Assignment.id))
        .join(Guard)
        .filter(Guard.company_id == company_id, Assignment.date >= start, Assignment.date <= end)
        .group_by(Assignment.date)
        .all()
    )
    by_date = {r[0]: r[1] for r in rows}
    out: list[ChartPoint] = []
    d = start
    while d <= end:
        out.append(ChartPoint(label=d.isoformat(), value=float(by_date.get(d, 0))))
        d += timedelta(days=1)
    return out


def _payroll_by_month(db: Session, company_id: int, months: int = 6) -> list[ChartPoint]:
    cutoff = date.today().replace(day=1) - timedelta(days=months * 31)
    rows = (
        db.query(
            func.strftime("%Y-%m", Payroll.period_end),
            func.sum(func.coalesce(Payroll.bank_amount, 0) + func.coalesce(Payroll.cash_amount, 0)),
        )
        .filter(Payroll.company_id == company_id, Payroll.period_end >= cutoff)
        .group_by(func.strftime("%Y-%m", Payroll.period_end))
        .order_by(func.strftime("%Y-%m", Payroll.period_end))
        .all()
    )
    return [ChartPoint(label=r[0] or "", value=float(r[1] or 0)) for r in rows]


def _attendance_breakdown(db: Session, company_id: int, days: int = 30) -> list[ChartPoint]:
    since = date.today() - timedelta(days=days)
    rows = (
        db.query(Attendance.status, func.count(Attendance.id))
        .join(Assignment, Attendance.assignment_id == Assignment.id)
        .join(Guard, Assignment.guard_id == Guard.id)
        .filter(Guard.company_id == company_id, Assignment.date >= since)
        .group_by(Attendance.status)
        .all()
    )
    labels = {"on_time": "On time", "late": "Late", "absent": "Absent", "present": "Present"}
    return [
        ChartPoint(label=labels.get((r[0] or "unknown"), r[0] or "Other"), value=float(r[1]))
        for r in rows
    ]


def get_dashboard_stats(db: Session, user_id: int) -> DashboardStats:
    company = get_company_by_user_id(db, user_id)
    cid = company.id
    today = date.today()
    cutoff = today + timedelta(days=30)
    month_start = today.replace(day=1)

    active_guards = db.query(Guard).filter(Guard.company_id == cid).count()
    sites_count = db.query(Site).filter(Site.company_id == cid).count()
    clients_count = db.query(Client).filter(Client.company_id == cid).count()

    expiring = (
        db.query(GuardDocument)
        .join(Guard)
        .filter(
            Guard.company_id == cid,
            GuardDocument.expiry_date != None,
            GuardDocument.expiry_date <= cutoff,
        )
        .count()
    )

    sia_expiring = (
        db.query(Guard)
        .filter(
            Guard.company_id == cid,
            Guard.sia_expiry_date != None,
            Guard.sia_expiry_date <= cutoff,
        )
        .count()
    )

    payroll_total = (
        db.query(
            func.coalesce(
                func.sum(func.coalesce(Payroll.bank_amount, 0) + func.coalesce(Payroll.cash_amount, 0)),
                0,
            )
        )
        .filter(Payroll.company_id == cid)
        .scalar()
        or 0
    )

    payroll_mtd = (
        db.query(
            func.coalesce(
                func.sum(func.coalesce(Payroll.bank_amount, 0) + func.coalesce(Payroll.cash_amount, 0)),
                0,
            )
        )
        .filter(Payroll.company_id == cid, Payroll.period_end >= month_start)
        .scalar()
        or 0
    )

    invoice_total = (
        db.query(func.coalesce(func.sum(Invoice.total), 0)).filter(Invoice.company_id == cid).scalar() or 0
    )

    invoice_outstanding = (
        db.query(func.coalesce(func.sum(Invoice.total), 0))
        .filter(Invoice.company_id == cid, Invoice.status.in_(["draft", "sent"]))
        .scalar()
        or 0
    )

    late_count = (
        db.query(Attendance)
        .join(Assignment, Attendance.assignment_id == Assignment.id)
        .join(Guard, Assignment.guard_id == Guard.id)
        .filter(
            Guard.company_id == cid,
            Assignment.date >= today - timedelta(days=30),
            Attendance.status == "late",
        )
        .count()
    )

    present_count = (
        db.query(Attendance)
        .join(Assignment, Attendance.assignment_id == Assignment.id)
        .join(Guard, Assignment.guard_id == Guard.id)
        .filter(
            Guard.company_id == cid,
            Assignment.date == today,
            Attendance.status.in_(["present", "on_time"]),
        )
        .count()
    )

    absent_count = (
        db.query(Attendance)
        .join(Assignment, Attendance.assignment_id == Assignment.id)
        .join(Guard, Assignment.guard_id == Guard.id)
        .filter(
            Guard.company_id == cid,
            Assignment.date == today,
            Attendance.status == "absent",
        )
        .count()
    )

    upcoming = (
        db.query(Assignment)
        .join(Guard)
        .filter(
            Guard.company_id == cid,
            Assignment.date >= today,
            Assignment.date <= today + timedelta(days=7),
        )
        .count()
    )

    shifts_today = (
        db.query(Assignment)
        .join(Guard)
        .filter(Guard.company_id == cid, Assignment.date == today)
        .count()
    )

    mt, ma, st, sa = _contractor_counts(db, cid)
    contracts_soon = count_contracts_expiring_soon(db, cid, 30)
    notify_admin_contract_expiry(db, cid)

    return DashboardStats(
        active_guards=active_guards,
        sites_count=sites_count,
        clients_count=clients_count,
        expiring_documents=expiring,
        sia_expiring_30d=sia_expiring,
        revenue_total=float(payroll_total),
        payroll_mtd=float(payroll_mtd),
        invoice_total=float(invoice_total),
        invoice_outstanding=float(invoice_outstanding),
        late_count=late_count,
        present_count=present_count,
        absent_count=absent_count,
        upcoming_shifts=upcoming,
        shifts_today=shifts_today,
        main_contractors_total=mt,
        main_contractors_active=ma,
        sub_contractors_total=st,
        sub_contractors_active=sa,
        contracts_expiring_soon=contracts_soon,
    )


def get_dashboard_overview(db: Session, user_id: int) -> DashboardOverview:
    company = get_company_by_user_id(db, user_id)
    today = date.today()
    stats = get_dashboard_stats(db, user_id)
    shifts = _shifts_by_day(db, company.id, today - timedelta(days=13), today + timedelta(days=7))
    attendance = _attendance_breakdown(db, company.id)
    payroll_months = _payroll_by_month(db, company.id)
    operations = [
        ChartPoint(label="Staff", value=float(stats.active_guards)),
        ChartPoint(label="Sites", value=float(stats.sites_count)),
        ChartPoint(label="Clients", value=float(stats.clients_count)),
        ChartPoint(label="Shifts (7d)", value=float(stats.upcoming_shifts)),
    ]
    return DashboardOverview(
        stats=stats,
        shifts_by_day=shifts,
        attendance_by_status=attendance,
        payroll_by_month=payroll_months,
        operations_compare=operations,
    )


def get_contract_expiry_alerts(db: Session, user_id: int, days: int = 30):
    company = get_company_by_user_id(db, user_id)
    return list_contract_expiry_alerts(db, company.id, days)


def get_compliance_alerts(db: Session, user_id: int, days: int = 30) -> list:
    company = get_company_by_user_id(db, user_id)
    cutoff = date.today() + timedelta(days=days)
    rows = (
        db.query(GuardDocument, Guard)
        .join(Guard)
        .filter(
            Guard.company_id == company.id,
            GuardDocument.expiry_date != None,
            GuardDocument.expiry_date <= cutoff,
        )
        .order_by(GuardDocument.expiry_date)
        .all()
    )
    return [
        ComplianceAlert(
            guard_id=g.id,
            guard_name=g.full_name,
            document_type=d.document_type,
            expiry_date=d.expiry_date,
        )
        for d, g in rows
    ]
