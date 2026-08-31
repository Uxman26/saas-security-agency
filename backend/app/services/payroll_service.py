import json
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
from app.models import Payroll, Guard, Site, RotaPlan
from app.schemas import PayrollCreate, PayrollUpdate, PayrollResponse
from app.services.company_service import get_company_by_user_id

VALID_PAYMENT_MODES = {"100_bank", "100_cash", "split"}

def _number(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _hours_from_shift(shift: dict, include_breaks: bool) -> float:
    def mins(raw: str) -> int:
        try:
            hour, minute = str(raw or "00:00").split(":")[:2]
            return int(hour) * 60 + int(minute)
        except (TypeError, ValueError):
            return 0

    duration = mins(shift.get("end")) - mins(shift.get("start"))
    if duration < 0:
        duration += 24 * 60
    if not include_breaks:
        duration -= int(shift.get("breakH") or 0) * 60 + int(shift.get("breakM") or 0)
    return max(0.0, duration / 60)


def _planner_payroll_lines(plan: RotaPlan) -> list[dict]:
    try:
        payload = json.loads(plan.planner_data or "{}")
    except (json.JSONDecodeError, TypeError):
        return []

    # Always derive from live shifts + attendance status so hours respect inclBreaks
    # and are not frozen by stale attendance.hours / payrollLines snapshots.
    lines: list[dict] = []
    attendance = payload.get("attendance") or {}
    include_breaks = bool(payload.get("inclBreaks", False))
    for guard_id, by_date in (payload.get("shifts") or {}).items():
        for day, shifts in (by_date or {}).items():
            for index, shift in enumerate(shifts or []):
                if not isinstance(shift, dict):
                    continue
                record = attendance.get(f"{guard_id}:{day}:{index}") or {}
                status = str(record.get("status") or "").strip().lower().replace(" ", "_")
                if status == "present":
                    status = "on_time"
                if status not in {"on_time", "late"}:
                    continue
                hours = _hours_from_shift(shift, include_breaks)
                if hours <= 0:
                    continue
                rate = _number(shift.get("shiftRate"))
                lines.append(
                    {
                        "guardId": str(guard_id),
                        "date": str(day),
                        "site": shift.get("site") or "",
                        "hours": hours,
                        "rate": rate,
                        "amount": hours * rate,
                        "status": status,
                    }
                )
    return lines


def _apply_payment_split(pr: Payroll, base: float) -> None:
    """Set bank/cash from total payable using the record's payment_mode."""
    mode = (pr.payment_mode or "100_bank").strip().lower()
    base = max(0.0, float(base))
    if mode == "100_cash":
        pr.bank_amount = 0.0
        pr.cash_amount = round(base, 2)
    elif mode == "split":
        prev = float(pr.bank_amount or 0) + float(pr.cash_amount or 0)
        if prev > 0:
            bank_share = float(pr.bank_amount or 0) / prev
            pr.bank_amount = round(base * bank_share, 2)
            pr.cash_amount = round(base - pr.bank_amount, 2)
        else:
            half = round(base / 2, 2)
            pr.bank_amount = half
            pr.cash_amount = round(base - half, 2)
    else:
        pr.bank_amount = round(base, 2)
        pr.cash_amount = 0.0


def _upsert_from_rota_lines(
    db: Session,
    company_id: int,
    guard_id: int,
    lines: list[dict],
    period_start: date,
    period_end: date,
) -> tuple[Payroll, bool]:
    """Import rota payable totals into a payroll row. Returns (record, created)."""
    total_hours = sum(max(0.0, _number(line.get("hours"))) for line in lines)
    total_amount = sum(max(0.0, _number(line.get("amount"))) for line in lines)
    if total_hours <= 0:
        raise HTTPException(status_code=400, detail="No payable rota hours found for this employee")
    hourly_rate = total_amount / total_hours

    existing = (
        db.query(Payroll)
        .filter(
            Payroll.company_id == company_id,
            Payroll.guard_id == guard_id,
            Payroll.period_start == period_start,
            Payroll.period_end == period_end,
        )
        .first()
    )
    if existing:
        existing.total_hours = total_hours
        existing.hourly_rate = hourly_rate
        base = total_amount + float(existing.allowance_total or 0)
        _apply_payment_split(existing, base)
        return existing, False

    pr = Payroll(
        company_id=company_id,
        guard_id=guard_id,
        period_start=period_start,
        period_end=period_end,
        total_hours=total_hours,
        hourly_rate=hourly_rate,
        bank_amount=total_amount,
        cash_amount=0.0,
        allowance_total=0.0,
        payment_mode="100_bank",
    )
    db.add(pr)
    return pr, True


def create_payroll(db: Session, data: PayrollCreate, user_id: int) -> Payroll:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == data.guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    pr = Payroll(company_id=company.id, **payload)
    db.add(pr)
    db.commit()
    db.refresh(pr)
    return pr

def get_payrolls(
    db: Session,
    user_id: int,
    guard_id: Optional[int] = None,
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
    search: Optional[str] = None,
) -> List[Payroll]:
    company = get_company_by_user_id(db, user_id)
    q = db.query(Payroll).filter(Payroll.company_id == company.id)
    if guard_id:
        q = q.filter(Payroll.guard_id == guard_id)
    if period_start:
        q = q.filter(Payroll.period_end >= period_start)
    if period_end:
        q = q.filter(Payroll.period_start <= period_end)
    term = (search or "").strip()
    if term:
        # What the box on the screen offers: a guard's name, or any part of either period
        # date typed as it is displayed (2026-07, 2026-08-03…).
        like = f"%{term.lower()}%"
        q = q.join(Guard, Payroll.guard_id == Guard.id).filter(
            or_(
                func.lower(Guard.full_name).like(like),
                cast(Payroll.period_start, String).like(like),
                cast(Payroll.period_end, String).like(like),
            )
        )
    return q.order_by(Payroll.period_end.desc()).all()

def get_payroll(db: Session, payroll_id: int, user_id: int) -> Payroll:
    company = get_company_by_user_id(db, user_id)
    pr = db.query(Payroll).filter(Payroll.id == payroll_id, Payroll.company_id == company.id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Payroll not found")
    return pr

def calculate_payroll(db: Session, guard_id: int, period_start: date, period_end: date, user_id: int) -> Payroll:
    rows = calculate_payroll_batch(
        db,
        user_id,
        period_start,
        period_end,
        "employee",
        guard_id=guard_id,
    )
    return rows[0]


def calculate_payroll_batch(
    db: Session,
    user_id: int,
    period_start: date,
    period_end: date,
    mode: str,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    rota_plan_id: Optional[int] = None,
) -> List[Payroll]:
    company = get_company_by_user_id(db, user_id)
    mode = (mode or "employee").lower().strip()
    if period_start > period_end:
        raise HTTPException(status_code=400, detail="period_start cannot be after period_end")

    plans_query = db.query(RotaPlan).filter(
        RotaPlan.company_id == company.id,
        RotaPlan.status == "published",
        RotaPlan.end_date >= period_start,
        RotaPlan.start_date <= period_end,
    )
    selected_site_name: Optional[str] = None
    if mode == "employee":
        if not guard_id:
            raise HTTPException(status_code=400, detail="guard_id required for employee payroll")
        guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
        if not guard:
            raise HTTPException(status_code=404, detail="Guard not found")
    elif mode == "site":
        if not site_id:
            raise HTTPException(status_code=400, detail="site_id required for site payroll")
        site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        selected_site_name = (site.name or "").strip().lower()
    elif mode == "rota":
        if not rota_plan_id:
            raise HTTPException(status_code=400, detail="rota_plan_id required for rota payroll")
        plan = db.query(RotaPlan).filter(RotaPlan.id == rota_plan_id, RotaPlan.company_id == company.id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Rota not found")
        if plan.status != "published":
            raise HTTPException(status_code=400, detail="Publish the rota before creating payroll")
        plans_query = plans_query.filter(RotaPlan.id == rota_plan_id)
    else:
        raise HTTPException(status_code=400, detail="mode must be employee, site, or rota")

    by_guard: dict[int, list[dict]] = {}
    for plan in plans_query.all():
        for line in _planner_payroll_lines(plan):
            try:
                line_date = date.fromisoformat(str(line.get("date")))
                line_guard_id = int(line.get("guardId"))
            except (TypeError, ValueError):
                continue
            if line_date < period_start or line_date > period_end:
                continue
            if mode == "employee" and line_guard_id != guard_id:
                continue
            if mode == "site" and (str(line.get("site") or "").strip().lower() != selected_site_name):
                continue
            by_guard.setdefault(line_guard_id, []).append(line)

    if not by_guard:
        raise HTTPException(
            status_code=400,
            detail="No payable On time or Late shifts found in published rota data for the selected period",
        )

    created: list[Payroll] = []
    for gid, lines in by_guard.items():
        guard = db.query(Guard).filter(Guard.id == gid, Guard.company_id == company.id).first()
        if not guard:
            continue
        pr, _was_created = _upsert_from_rota_lines(
            db,
            company.id,
            gid,
            lines,
            period_start,
            period_end,
        )
        created.append(pr)
    if not created:
        raise HTTPException(status_code=400, detail="No valid employee payroll records could be created")
    db.commit()
    for pr in created:
        db.refresh(pr)
    return created

# Attendance marks that mean the shift was actually worked. Anything else — absent,
# pending, or a future shift nobody has marked yet — is rota'd but not payable.
PAYABLE_STATUSES = frozenset({"on_time", "late"})


def preview_pay(
    db: Session,
    user_id: int,
    guard_id: Optional[int],
    period_start: date,
    period_end: date,
) -> "PayrollPreviewResponse":
    """What is owed for a period, without saving anything.

    ``guard_id`` of None covers every employee, which is the default the screen opens
    on; pass one to drill into a single person.

    Pay follows attendance: only shifts marked On time or Late are payable. The rota'd
    totals are returned alongside so the gap is visible rather than silent — a site with
    30 hours rota'd and 20 attended reports both, and pays the 20. Hours come from the
    assignment's own times, so a logged late start or overtime is already reflected.
    """
    from app.schemas import (
        PayrollPreviewEmployee,
        PayrollPreviewResponse,
        PayrollPreviewShift,
        PayrollPreviewSite,
    )
    from app.services.rota_service import list_rota_details

    company = get_company_by_user_id(db, user_id)
    if period_start > period_end:
        raise HTTPException(status_code=400, detail="Period start cannot be after period end")
    guard = None
    if guard_id is not None:
        guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
        if not guard:
            raise HTTPException(status_code=404, detail="Employee not found")

    details = list_rota_details(db, user_id, period_start, period_end, guard_id=guard_id)

    shifts: list[PayrollPreviewShift] = []
    sites: dict[Optional[int], PayrollPreviewSite] = {}
    people: dict[int, PayrollPreviewEmployee] = {}
    missing_rate = 0

    for d in details:
        hours = round(float(d.hours or 0), 2)
        rate = _number(d.shift_rate)
        payable = d.attendance_status in PAYABLE_STATUSES
        amount = round(hours * rate, 2) if payable else 0.0
        if payable and rate <= 0:
            missing_rate += 1

        shifts.append(
            PayrollPreviewShift(
                assignment_id=d.id,
                guard_id=d.guard_id,
                guard_name=d.guard_name or "",
                date=d.date,
                site_id=d.site_id,
                site_name=d.site_name or "",
                shift_start=d.shift_start,
                shift_end=d.shift_end,
                break_minutes=d.break_minutes or 0,
                hours=hours,
                attendance_status=d.attendance_status,
                late_minutes=d.late_minutes,
                shift_rate=d.shift_rate,
                payable=payable,
                amount=amount,
            )
        )

        row = sites.get(d.site_id)
        if row is None:
            row = PayrollPreviewSite(site_id=d.site_id, site_name=d.site_name or "")
            sites[d.site_id] = row
        person = people.get(d.guard_id)
        if person is None:
            person = PayrollPreviewEmployee(guard_id=d.guard_id, guard_name=d.guard_name or "")
            people[d.guard_id] = person
        for bucket in (row, person):
            bucket.shifts += 1
            bucket.rota_hours = round(bucket.rota_hours + hours, 2)
            if payable:
                bucket.attended_hours = round(bucket.attended_hours + hours, 2)
                bucket.amount = round(bucket.amount + amount, 2)
            else:
                bucket.unattended_hours = round(bucket.unattended_hours + hours, 2)

    by_site = sorted(sites.values(), key=lambda r: r.site_name.lower())
    # Biggest payment first: on the all-employees view that is the order you check.
    by_employee = sorted(people.values(), key=lambda r: (-r.amount, r.guard_name.lower()))
    rota_hours = round(sum(x.hours for x in shifts), 2)
    attended_hours = round(sum(x.hours for x in shifts if x.payable), 2)

    return PayrollPreviewResponse(
        guard_id=guard.id if guard else None,
        guard_name=guard.full_name if guard else "All employees",
        period_start=period_start,
        period_end=period_end,
        total_shifts=len(shifts),
        attended_shifts=sum(1 for x in shifts if x.payable),
        rota_hours=rota_hours,
        attended_hours=attended_hours,
        unattended_hours=round(rota_hours - attended_hours, 2),
        amount=round(sum(x.amount for x in shifts), 2),
        rota_amount=round(sum(x.hours * _number(x.shift_rate) for x in shifts), 2),
        shifts_missing_rate=missing_rate,
        employee_count=len(by_employee),
        by_employee=by_employee,
        by_site=by_site,
        shifts=shifts,
    )


def delete_payroll(db: Session, payroll_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    pr = db.query(Payroll).filter(Payroll.id == payroll_id, Payroll.company_id == company.id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Payroll not found")
    db.delete(pr)
    db.commit()

def update_payroll(db: Session, payroll_id: int, data: PayrollUpdate, user_id: int) -> Payroll:
    company = get_company_by_user_id(db, user_id)
    pr = db.query(Payroll).filter(Payroll.id == payroll_id, Payroll.company_id == company.id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Payroll not found")
    payload = data.model_dump(exclude_unset=True) if hasattr(data, "model_dump") else data.dict(exclude_unset=True)
    if "payment_mode" in payload and payload["payment_mode"] is not None:
        mode = str(payload["payment_mode"]).strip().lower()
        if mode not in VALID_PAYMENT_MODES:
            raise HTTPException(status_code=400, detail="payment_mode must be 100_bank, 100_cash, or split")
        payload["payment_mode"] = mode
    if "period_start" in payload and "period_end" in payload:
        if payload["period_start"] and payload["period_end"] and payload["period_start"] > payload["period_end"]:
            raise HTTPException(status_code=400, detail="period_start cannot be after period_end")
    elif "period_start" in payload and payload["period_start"] and pr.period_end and payload["period_start"] > pr.period_end:
        raise HTTPException(status_code=400, detail="period_start cannot be after period_end")
    elif "period_end" in payload and payload["period_end"] and pr.period_start and payload["period_end"] < pr.period_start:
        raise HTTPException(status_code=400, detail="period_end cannot be before period_start")
    for field in ("total_hours", "hourly_rate", "bank_amount", "cash_amount", "allowance_total"):
        if field in payload and payload[field] is not None and payload[field] < 0:
            raise HTTPException(status_code=400, detail=f"{field} cannot be negative")
    for k, v in payload.items():
        setattr(pr, k, v)
    # Keep bank/cash consistent with payment mode when mode changes and amounts not both provided
    mode = pr.payment_mode or "100_bank"
    base = float(pr.total_hours or 0) * float(pr.hourly_rate or 0) + float(pr.allowance_total or 0)
    if mode == "100_bank" and "bank_amount" not in payload and "cash_amount" not in payload:
        pr.bank_amount = base
        pr.cash_amount = 0.0
    elif mode == "100_cash" and "bank_amount" not in payload and "cash_amount" not in payload:
        pr.cash_amount = base
        pr.bank_amount = 0.0
    db.commit()
    db.refresh(pr)
    return pr
