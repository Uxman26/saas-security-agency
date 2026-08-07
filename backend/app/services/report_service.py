from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, or_
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
    RotaPlan,
)
from app.schemas import DashboardStats, ComplianceAlert, ChartPoint, DashboardOverview
from app.services.company_service import get_company_by_user_id
from app.services.contract_alert_service import (
    count_contracts_expiring_soon,
    list_contract_expiry_alerts,
)


def _contractor_counts(db: Session, company_id: int) -> tuple[int, int, int, int]:
    """One aggregated query for directory contractors; legacy tables as fallback."""
    row = (
        db.query(
            func.coalesce(
                func.sum(case((Contractor.type == ContractorKind.main, 1), else_=0)),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            and_(
                                Contractor.type == ContractorKind.main,
                                Contractor.is_active.is_(True),
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(case((Contractor.type == ContractorKind.sub, 1), else_=0)),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            and_(
                                Contractor.type == ContractorKind.sub,
                                Contractor.is_active.is_(True),
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
        )
        .filter(Contractor.company_id == company_id)
        .one()
    )
    mt, ma, st, sa = (int(row[0] or 0), int(row[1] or 0), int(row[2] or 0), int(row[3] or 0))
    if mt or st:
        return mt, ma, st, sa

    mt = db.query(func.count(MainContractor.id)).filter(MainContractor.company_id == company_id).scalar() or 0
    ma = (
        db.query(func.count(MainContractor.id))
        .filter(MainContractor.company_id == company_id, MainContractor.status == "active")
        .scalar()
        or 0
    )
    st = db.query(func.count(SubContractor.id)).filter(SubContractor.company_id == company_id).scalar() or 0
    sa = (
        db.query(func.count(SubContractor.id))
        .filter(SubContractor.company_id == company_id, SubContractor.status == "active")
        .scalar()
        or 0
    )
    return int(mt), int(ma), int(st), int(sa)


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


def get_dashboard_stats(db: Session, user_id: int, company_id: Optional[int] = None) -> DashboardStats:
    cid = company_id
    if cid is None:
        company = get_company_by_user_id(db, user_id)
        cid = company.id
    today = date.today()
    cutoff = today + timedelta(days=30)
    month_start = today.replace(day=1)
    since_30 = today - timedelta(days=30)
    until_7 = today + timedelta(days=7)

    active_guards = db.query(func.count(Guard.id)).filter(Guard.company_id == cid).scalar() or 0
    sites_count = db.query(func.count(Site.id)).filter(Site.company_id == cid).scalar() or 0
    clients_count = db.query(func.count(Client.id)).filter(Client.company_id == cid).scalar() or 0

    expiring = (
        db.query(func.count(GuardDocument.id))
        .join(Guard)
        .filter(
            Guard.company_id == cid,
            GuardDocument.expiry_date.isnot(None),
            GuardDocument.expiry_date <= cutoff,
        )
        .scalar()
        or 0
    )

    sia_expiring = (
        db.query(func.count(Guard.id))
        .filter(
            Guard.company_id == cid,
            Guard.sia_expiry_date.isnot(None),
            Guard.sia_expiry_date <= cutoff,
        )
        .scalar()
        or 0
    )

    # Payroll total + MTD in one scan
    pay_amt = func.coalesce(Payroll.bank_amount, 0) + func.coalesce(Payroll.cash_amount, 0)
    payroll_row = (
        db.query(
            func.coalesce(func.sum(pay_amt), 0),
            func.coalesce(
                func.sum(case((Payroll.period_end >= month_start, pay_amt), else_=0)),
                0,
            ),
        )
        .filter(Payroll.company_id == cid)
        .one()
    )
    payroll_total = float(payroll_row[0] or 0)
    payroll_mtd = float(payroll_row[1] or 0)

    inv_row = (
        db.query(
            func.coalesce(func.sum(Invoice.total), 0),
            func.coalesce(
                func.sum(case((Invoice.status.in_(["draft", "sent"]), Invoice.total), else_=0)),
                0,
            ),
        )
        .filter(Invoice.company_id == cid)
        .one()
    )
    invoice_total = float(inv_row[0] or 0)
    invoice_outstanding = float(inv_row[1] or 0)

    # Attendance: late (30d) + present/absent today — one grouped query
    att_rows = (
        db.query(Attendance.status, Assignment.date, func.count(Attendance.id))
        .join(Assignment, Attendance.assignment_id == Assignment.id)
        .join(Guard, Assignment.guard_id == Guard.id)
        .filter(
            Guard.company_id == cid,
            or_(
                and_(Assignment.date >= since_30, Attendance.status == "late"),
                and_(
                    Assignment.date == today,
                    Attendance.status.in_(["present", "on_time", "absent"]),
                ),
            ),
        )
        .group_by(Attendance.status, Assignment.date)
        .all()
    )
    late_count = 0
    present_count = 0
    absent_count = 0
    for status, day, cnt in att_rows:
        n = int(cnt or 0)
        if status == "late" and day and day >= since_30:
            late_count += n
        if day == today:
            if status in ("present", "on_time"):
                present_count += n
            elif status == "absent":
                absent_count += n

    # Shifts today + next 7 days in one pass
    shift_row = (
        db.query(
            func.coalesce(
                func.sum(case((Assignment.date == today, 1), else_=0)),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (and_(Assignment.date >= today, Assignment.date <= until_7), 1),
                        else_=0,
                    )
                ),
                0,
            ),
        )
        .join(Guard)
        .filter(
            Guard.company_id == cid,
            Assignment.date >= today,
            Assignment.date <= until_7,
        )
        .one()
    )
    shifts_today = int(shift_row[0] or 0)
    upcoming = int(shift_row[1] or 0)

    mt, ma, st, sa = _contractor_counts(db, cid)
    contracts_soon = count_contracts_expiring_soon(db, cid, 30)
    # NOTE: do not call notify_admin_contract_expiry here — it sends email + commits
    # and made every dashboard load slow. Run that from a cron / dedicated alert job.

    rota_row = (
        db.query(
            func.count(RotaPlan.id),
            func.coalesce(func.sum(case((RotaPlan.end_date >= today, 1), else_=0)), 0),
        )
        .filter(RotaPlan.company_id == cid)
        .one()
    )
    rotas_total = int(rota_row[0] or 0)
    rotas_active = int(rota_row[1] or 0)

    return DashboardStats(
        active_guards=int(active_guards),
        sites_count=int(sites_count),
        clients_count=int(clients_count),
        expiring_documents=int(expiring),
        sia_expiring_30d=int(sia_expiring),
        revenue_total=payroll_total,
        payroll_mtd=payroll_mtd,
        invoice_total=invoice_total,
        invoice_outstanding=invoice_outstanding,
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
        rotas_total=rotas_total,
        rotas_active=rotas_active,
    )


def get_dashboard_overview(db: Session, user_id: int) -> DashboardOverview:
    company = get_company_by_user_id(db, user_id)
    today = date.today()
    # Pass company_id to avoid a second company lookup
    stats = get_dashboard_stats(db, user_id, company_id=company.id)
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
            GuardDocument.expiry_date.isnot(None),
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
