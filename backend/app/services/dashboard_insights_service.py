from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import (
    Assignment,
    Attendance,
    Client,
    Guard,
    GuardDocument,
    Incident,
    Invoice,
    LoneWorkerSession,
    Payment,
    Payroll,
    RotaPlan,
    Site,
    StaffRequest,
    User,
)
from app.rbac import user_has_permission_db
from app.services.company_service import get_company_by_user_id
from app.services.contract_alert_service import count_contracts_expiring_soon

OPEN_INVOICE = ("sent", "issued", "unpaid", "partial", "overdue")
ON_TIME = ("on_time", "present")
ABSENT = ("absent", "no_show")
CANCELLED = ("cancelled", "cancelled_paid")
ATTENDED = ON_TIME + ("late",)
MAX_POINTS = 31


def _days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _sample(values: list[float]) -> list[float]:
    if len(values) <= MAX_POINTS:
        return values
    step = (len(values) - 1) / (MAX_POINTS - 1)
    return [values[round(i * step)] for i in range(MAX_POINTS)]


def _as_date(v) -> Optional[date]:
    if v is None:
        return None
    return v.date() if isinstance(v, datetime) else v


def _aware(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _cumulative(created: list, days: list[date]) -> list[float]:
    by_day = Counter(_as_date(c) for c in created)
    base = sum(n for d, n in by_day.items() if d is None or d < days[0])
    out, run = [], base
    for d in days:
        run += by_day.get(d, 0)
        out.append(float(run))
    return out


def _hours(start: Optional[str], end: Optional[str], brk: Optional[int]) -> float:
    try:
        sh, sm = (int(x) for x in str(start)[:5].split(":"))
        eh, em = (int(x) for x in str(end)[:5].split(":"))
    except (TypeError, ValueError):
        return 0.0
    mins = (eh * 60 + em) - (sh * 60 + sm)
    if mins <= 0:
        mins += 24 * 60
    return max(0.0, (mins - (brk or 0)) / 60)


def _metric(value: float, previous: Optional[float], series: list[float]) -> dict:
    return {"value": value, "previous": previous, "series": _sample(series)}


def _compliance(guards: list, docs: list, at: date) -> Optional[float]:
    pool = [g for g in guards if _as_date(g[1]) is None or _as_date(g[1]) <= at]
    if not pool:
        return None
    bad = {gid for gid, exp, created in docs if exp and exp < at and (_as_date(created) or at) <= at}
    bad |= {g[0] for g in pool if g[2] and g[2] < at}
    return round(100 * sum(1 for g in pool if g[0] not in bad) / len(pool), 1)


def _shift_status(att: Optional[Attendance]) -> str:
    if not att:
        return "scheduled"
    st = (att.status or "").lower()
    if st in CANCELLED:
        return "cancelled"
    if st in ABSENT:
        return "absent"
    if att.booked_off_at:
        return "completed"
    if att.booked_at:
        return "late" if st == "late" else "on_duty"
    return "late" if st == "late" else "scheduled"


def get_dashboard_insights(db: Session, user: User, start: date, end: date) -> dict:
    cid = get_company_by_user_id(db, user.id).id
    today = date.today()
    span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span - 1)
    days = _days(min(start, end - timedelta(days=13)), end)
    allowed = lambda code: user_has_permission_db(db, user, code)

    guards = db.query(Guard.id, Guard.created_at, Guard.sia_expiry_date).filter(Guard.company_id == cid).all()
    site_created = [r[0] for r in db.query(Site.created_at).filter(Site.company_id == cid).all()]
    client_created = [r[0] for r in db.query(Client.created_at).filter(Client.company_id == cid).all()]
    staff_s = _cumulative([g[1] for g in guards], days)
    site_s = _cumulative(site_created, days)
    client_s = _cumulative(client_created, days)
    prev_count = lambda xs: float(sum(1 for c in xs if _as_date(c) is None or _as_date(c) <= prev_end))

    rotas = db.query(RotaPlan.start_date, RotaPlan.end_date).filter(RotaPlan.company_id == cid).all()
    active_on = lambda d: float(sum(1 for s, e in rotas if s and e and s <= d <= e))
    rota_s = [active_on(d) for d in days]
    rotas_now = float(sum(1 for _, e in rotas if e and e >= today))

    docs = (
        db.query(GuardDocument.guard_id, GuardDocument.expiry_date, GuardDocument.created_at)
        .join(Guard)
        .filter(Guard.company_id == cid, GuardDocument.expiry_date.isnot(None))
        .all()
    )
    pts = [days[round(i * (len(days) - 1) / 13)] for i in range(14)]
    comp_s = [_compliance(guards, docs, d) for d in pts]
    comp_now = _compliance(guards, docs, min(end, today))
    comp_prev = _compliance(guards, docs, prev_end)

    kpis = {
        "staff": _metric(float(len(guards)), prev_count([g[1] for g in guards]), staff_s),
        "sites": _metric(float(len(site_created)), prev_count(site_created), site_s),
        "clients": _metric(float(len(client_created)), prev_count(client_created), client_s),
        "rotas_active": _metric(rotas_now, active_on(prev_end), rota_s),
        "contracts_expiring": _metric(float(count_contracts_expiring_soon(db, cid, 30)), None, []),
        "compliance_score": _metric(comp_now, comp_prev, [v for v in comp_s if v is not None])
        if comp_now is not None
        else None,
    }

    horizon = max(end, today + timedelta(days=7)) if end >= today else end
    rows = (
        db.query(Assignment.date, Assignment.shift_start, Assignment.shift_end, Assignment.break_minutes, Attendance.status)
        .join(Guard, Assignment.guard_id == Guard.id)
        .outerjoin(Attendance, Attendance.assignment_id == Assignment.id)
        .filter(Guard.company_id == cid, Assignment.date >= prev_start, Assignment.date <= horizon)
        .all()
    )
    per_day: dict[date, dict] = {}
    att = {"current": Counter(), "previous": Counter()}
    for d, s, e, b, st in rows:
        if start <= d <= horizon:
            slot = per_day.setdefault(d, {"shifts": 0, "hours": 0.0, "attended": 0, "cancelled": 0})
            slot["shifts"] += 1
            slot["cancelled"] += int((st or "").lower() in CANCELLED)
            slot["hours"] += _hours(s, e, b)
            if st in ATTENDED:
                slot["attended"] += 1
        bucket = "current" if start <= d <= end else "previous" if d < start else None
        if bucket and d <= today:
            st = (st or "").lower()
            key = (
                "on_time" if st in ON_TIME else "late" if st == "late" else "absent" if st in ABSENT
                else "cancelled" if st in CANCELLED else "unrecorded" if not st and d < today else None
            )
            if key:
                att[bucket][key] += 1
    shifts = []
    for d in _days(start, horizon):
        slot = per_day.get(d, {"shifts": 0, "hours": 0.0, "attended": 0, "cancelled": 0})
        due = slot["shifts"] - slot["cancelled"]
        shifts.append({
            "date": d.isoformat(),
            "shifts": slot["shifts"],
            "hours": round(slot["hours"], 1),
            "coverage": round(100 * slot["attended"] / due, 1) if due and d < today else None,
        })

    def rate(c: Counter) -> Optional[float]:
        denom = c["on_time"] + c["late"] + c["absent"]
        return round(100 * c["on_time"] / denom, 1) if denom else None

    cur = att["current"]
    attendance = {
        "on_time": cur["on_time"], "late": cur["late"], "absent": cur["absent"],
        "cancelled": cur["cancelled"], "unrecorded": cur["unrecorded"],
        "on_time_rate": rate(cur), "previous_on_time_rate": rate(att["previous"]),
    }

    today_rows = (
        db.query(Assignment, Guard.full_name, Site.name, Site.color)
        .join(Guard, Assignment.guard_id == Guard.id)
        .outerjoin(Site, Assignment.site_id == Site.id)
        .filter(Guard.company_id == cid, Assignment.date == today)
        .order_by(Assignment.shift_start)
        .limit(60)
        .all()
    )
    today_ids = [a.id for a, *_ in today_rows]
    att_map = {
        a.assignment_id: a for a in db.query(Attendance).filter(Attendance.assignment_id.in_(today_ids)).all()
    } if today_ids else {}
    today_shifts = [
        {
            "id": a.id, "guard_id": a.guard_id, "guard_name": gname, "site_id": a.site_id,
            "site_name": sname or "", "site_color": scolor, "start": a.shift_start, "end": a.shift_end,
            "status": _shift_status(att_map.get(a.id)),
        }
        for a, gname, sname, scolor in today_rows
    ]
    statuses = Counter(s["status"] for s in today_shifts)
    in_progress = (
        db.query(func.count(Attendance.id))
        .join(Assignment, Attendance.assignment_id == Assignment.id)
        .join(Guard, Assignment.guard_id == Guard.id)
        .filter(
            Guard.company_id == cid,
            Assignment.date >= today - timedelta(days=1),
            Attendance.booked_at.isnot(None),
            Attendance.booked_off_at.is_(None),
            Attendance.booked_at >= datetime.now(timezone.utc) - timedelta(hours=24),
        )
        .scalar()
        or 0
    )

    live = {
        "shifts_today": db.query(func.count(Assignment.id)).join(Guard).filter(Guard.company_id == cid, Assignment.date == today).scalar() or 0,
        "present": statuses["on_duty"] + statuses["completed"] + statuses["late"],
        "late": statuses["late"],
        "absent": statuses["absent"],
        "in_progress": int(in_progress),
        "open_incidents": db.query(func.count(Incident.id)).filter(Incident.company_id == cid, Incident.status == "open").scalar() or 0
        if allowed("incidents.view") else None,
        "lone_workers_active": db.query(func.count(LoneWorkerSession.id)).filter(LoneWorkerSession.company_id == cid, LoneWorkerSession.status == "active").scalar() or 0
        if allowed("lone_worker.view") else None,
    }

    finance = _finance(db, cid, start, end, prev_start, prev_end, today, allowed("payroll.view")) if allowed("invoices.view") else None

    requests = None
    if allowed("staff_requests.view"):
        rq = (
            db.query(StaffRequest, Client.name, Site.name)
            .outerjoin(Client, StaffRequest.client_id == Client.id)
            .outerjoin(Site, StaffRequest.site_id == Site.id)
            .filter(StaffRequest.company_id == cid, StaffRequest.status == "pending")
            .order_by(StaffRequest.shift_date)
            .all()
        )
        requests = {
            "count": len(rq),
            "items": [
                {
                    "id": r.id, "client_name": cn or "", "site_name": sn or "", "shift_date": r.shift_date.isoformat(),
                    "shift_start": r.shift_start, "shift_end": r.shift_end, "staff_count": r.staff_count or 1,
                }
                for r, cn, sn in rq[:8]
            ],
        }

    sia = None
    if allowed("reports.compliance_view"):
        cutoff = today + timedelta(days=30)
        sia = [
            {"guard_id": gid, "guard_name": name, "expiry_date": exp.isoformat()}
            for gid, name, exp in db.query(Guard.id, Guard.full_name, Guard.sia_expiry_date)
            .filter(Guard.company_id == cid, Guard.sia_expiry_date.isnot(None), Guard.sia_expiry_date <= cutoff)
            .order_by(Guard.sia_expiry_date)
            .limit(50)
            .all()
        ]

    return {
        "range": {
            "start": start.isoformat(), "end": end.isoformat(),
            "previous_start": prev_start.isoformat(), "previous_end": prev_end.isoformat(),
            "today": today.isoformat(),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "live": live,
        "kpis": kpis,
        "shifts": shifts,
        "attendance": attendance,
        "today_shifts": today_shifts,
        "finance": finance,
        "staff_requests": requests,
        "sia_alerts": sia,
        "activity": _activity(db, cid, allowed),
    }


def _finance(db: Session, cid: int, start: date, end: date, prev_start: date, prev_end: date, today: date, show_payroll: bool) -> dict:
    from app.services.invoice_payment_service import batch_invoice_settlements

    inv_day = func.coalesce(Invoice.invoice_date, Invoice.period_end)
    m_start = (end.replace(day=1) - timedelta(days=150)).replace(day=1)
    lo = min(prev_start, m_start)
    invs = (
        db.query(Invoice.id, Invoice.client_id, Invoice.total, Invoice.status, inv_day, Invoice.due_date)
        .filter(Invoice.company_id == cid)
        .all()
    )
    issued = [i for i in invs if (i[3] or "").lower() not in ("draft", "cancelled")]
    open_inv = [i for i in invs if (i[3] or "").lower() in OPEN_INVOICE]
    settle = batch_invoice_settlements(db, [int(i[0]) for i in open_inv])
    owed = {i[0]: max(0.0, round(float(i[2] or 0), 2) - sum(settle.get(i[0], (0.0, 0.0)))) for i in open_inv}
    overdue = sorted(
        [i for i in open_inv if i[5] and i[5] < today and owed[i[0]] > 0.005],
        key=lambda i: i[5],
    )
    names = dict(db.query(Client.id, Client.name).filter(Client.company_id == cid).all())

    pays = (
        db.query(Payment.amount, Payment.paid_at)
        .filter(Payment.company_id == cid, Payment.paid_at >= datetime.combine(lo, datetime.min.time()))
        .all()
    )
    pay_amt = func.coalesce(Payroll.bank_amount, 0) + func.coalesce(Payroll.cash_amount, 0)
    payroll = (
        db.query(Payroll.period_end, pay_amt).filter(Payroll.company_id == cid, Payroll.period_end >= lo).all()
        if show_payroll else []
    )

    within = lambda d, a, b: d is not None and a <= d <= b
    total = lambda xs: round(sum(float(x or 0) for x in xs), 2)
    month = lambda d: d.strftime("%Y-%m")
    months = []
    m = m_start
    while m <= end:
        months.append(month(m))
        m = (m.replace(day=28) + timedelta(days=4)).replace(day=1)
    mi = Counter()
    mc = Counter()
    mp = Counter()
    for i in issued:
        if i[4] and i[4] >= m_start:
            mi[month(i[4])] += float(i[2] or 0)
    for amt, at in pays:
        d = _as_date(at)
        if d and d >= m_start:
            mc[month(d)] += float(amt or 0)
    for d, amt in payroll:
        if d and d >= m_start:
            mp[month(d)] += float(amt or 0)

    year_ago = today - timedelta(days=365)
    by_client = Counter()
    for i in issued:
        if i[1] and i[4] and i[4] >= year_ago:
            by_client[i[1]] += float(i[2] or 0)
    top_total = sum(by_client.values()) or 1

    return {
        "invoiced": total(i[2] for i in issued if within(i[4], start, end)),
        "invoiced_previous": total(i[2] for i in issued if within(i[4], prev_start, prev_end)),
        "collected": total(a for a, at in pays if within(_as_date(at), start, end)),
        "collected_previous": total(a for a, at in pays if within(_as_date(at), prev_start, prev_end)),
        "payroll": total(a for d, a in payroll if within(d, start, end)) if show_payroll else None,
        "payroll_previous": total(a for d, a in payroll if within(d, prev_start, prev_end)) if show_payroll else None,
        "invoiced_all_time": total(i[2] for i in issued),
        "outstanding": round(sum(owed.values()), 2),
        "overdue_amount": round(sum(owed[i[0]] for i in overdue), 2),
        "overdue_count": len(overdue),
        "months": [
            {"month": k, "invoiced": round(mi[k], 2), "collected": round(mc[k], 2), "payroll": round(mp[k], 2) if show_payroll else None}
            for k in months
        ],
        "overdue_invoices": [
            {
                "id": i[0], "client_name": names.get(i[1], ""), "outstanding": round(owed[i[0]], 2),
                "due_date": i[5].isoformat(), "days_overdue": (today - i[5]).days,
            }
            for i in overdue[:8]
        ],
        "top_clients": [
            {"id": k, "name": names.get(k, ""), "revenue": round(v, 2), "share": round(100 * v / top_total, 1)}
            for k, v in by_client.most_common(5)
        ],
    }


def _activity(db: Session, cid: int, allowed) -> list[dict]:
    events: list[dict] = []
    since = datetime.now(timezone.utc) - timedelta(days=14)
    n = 10
    if allowed("attendance.view"):
        for a, name, site in (
            db.query(Attendance, Guard.full_name, Site.name)
            .join(Assignment, Attendance.assignment_id == Assignment.id)
            .join(Guard, Assignment.guard_id == Guard.id)
            .outerjoin(Site, Assignment.site_id == Site.id)
            .filter(Guard.company_id == cid, or_(Attendance.booked_at >= since, Attendance.booked_off_at >= since))
            .order_by(func.coalesce(Attendance.booked_off_at, Attendance.booked_at).desc())
            .limit(n)
            .all()
        ):
            if a.booked_off_at:
                events.append({"type": "clock_out", "at": a.booked_off_at, "actor": name, "target": site or "", "href": "/attendance"})
            if a.booked_at and _aware(a.booked_at) >= since:
                events.append({
                    "type": "clock_in_late" if (a.status or "") == "late" else "clock_in",
                    "at": a.booked_at, "actor": name, "target": site or "", "href": "/attendance",
                })
    if allowed("incidents.view"):
        for i, site in (
            db.query(Incident, Site.name)
            .outerjoin(Site, Incident.site_id == Site.id)
            .filter(Incident.company_id == cid, Incident.created_at >= since)
            .order_by(Incident.created_at.desc())
            .limit(n)
            .all()
        ):
            events.append({"type": "incident", "at": i.created_at, "actor": site or "", "target": i.category or "other", "href": "/incidents"})
    if allowed("documents.view"):
        for d, name in (
            db.query(GuardDocument, Guard.full_name)
            .join(Guard)
            .filter(Guard.company_id == cid, GuardDocument.created_at >= since)
            .order_by(GuardDocument.created_at.desc())
            .limit(n)
            .all()
        ):
            events.append({"type": "document", "at": d.created_at, "actor": name, "target": d.document_type, "href": "/documents"})
    if allowed("payments.view"):
        for p, client in (
            db.query(Payment, Client.name)
            .join(Invoice, Payment.invoice_id == Invoice.id)
            .outerjoin(Client, Invoice.client_id == Client.id)
            .filter(Payment.company_id == cid, Payment.paid_at >= since)
            .order_by(Payment.paid_at.desc())
            .limit(n)
            .all()
        ):
            events.append({"type": "payment", "at": p.paid_at, "actor": client or "", "target": "", "amount": round(float(p.amount or 0), 2), "href": "/payments"})
    if allowed("staff_requests.view"):
        for r, client in (
            db.query(StaffRequest, Client.name)
            .outerjoin(Client, StaffRequest.client_id == Client.id)
            .filter(StaffRequest.company_id == cid, StaffRequest.created_at >= since)
            .order_by(StaffRequest.created_at.desc())
            .limit(n)
            .all()
        ):
            events.append({"type": "request", "at": r.created_at, "actor": client or "", "target": r.shift_date.isoformat(), "href": "/requests"})
    events = [e for e in events if e["at"]]
    events.sort(key=lambda e: _aware(e["at"]), reverse=True)
    return [{**e, "at": _aware(e["at"]).isoformat()} for e in events[:15]]
