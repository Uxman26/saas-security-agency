from __future__ import annotations

from typing import Any

from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app.models import (
    AccidentReport,
    Account,
    Allowance,
    Client,
    Contractor,
    CreditNote,
    Expense,
    Guard,
    GuardDocument,
    Incident,
    Invoice,
    Lead,
    OccurrenceSheet,
    PatrolRoute,
    Payment,
    Payroll,
    RotaPlan,
    Site,
    StaffRequest,
    Task,
    User,
    Vendor,
)
from app.rbac import user_has_permission_db
from app.services.company_service import get_company_by_user_id
from app.services.module_service import is_module_enabled
from app.services.portal_access import (
    filter_sites_for_user,
    get_linked_guard,
    is_client_portal_user,
    is_portal_role,
    is_staff_portal_user,
)

_EMPTY_KEYS = (
    "guards",
    "sites",
    "clients",
    "invoices",
    "leads",
    "rota_plans",
    "incidents",
    "tasks",
    "contractors",
    "documents",
    "patrol_routes",
    "accident_reports",
    "occurrence_sheets",
    "expenses",
    "vendors",
    "allowances",
    "payrolls",
    "payments",
    "staff_requests",
    "credit_notes",
    "accounts",
    "pages",
)

_PAGE_HINTS: tuple[tuple[str, str, str, tuple[str, ...]], ...] = (
    ("dashboard", "/dashboard", "Dashboard", ("dashboard", "home", "overview")),
    ("guards", "/guards", "Staff", ("staff", "guards", "employees", "people")),
    ("contractors", "/contractors", "Contractors", ("contractors", "contractor")),
    ("attendance", "/attendance", "Attendance", ("attendance", "book on", "clock")),
    ("absence", "/absence", "Absence", ("absence", "leave", "holiday")),
    ("staff_requests", "/requests", "Staff requests", ("requests", "staff request")),
    ("documents", "/documents", "Documents", ("documents", "files", "paperwork")),
    ("rota", "/rota", "Rotas & Shifts", ("rota", "rotas", "shifts", "schedule")),
    ("assignments", "/assignments", "Assignments", ("assignments", "assignment")),
    ("sites", "/sites", "Sites", ("sites", "site", "locations")),
    ("patrol", "/patrol", "Patrol", ("patrol", "checkpoints")),
    ("lone_worker", "/lone-worker", "Lone worker", ("lone worker", "lone-worker", "sos")),
    ("tasks", "/tasks", "Tasks", ("tasks", "task", "jobs")),
    ("incidents", "/incidents", "Incidents", ("incidents", "incident")),
    ("accident_reports", "/accident-reports", "Accident reports", ("accident", "accidents")),
    ("occurrence_sheets", "/occurrence-sheets", "Occurrence sheets", ("occurrence", "occurrences")),
    ("clients", "/clients", "Clients", ("clients", "client")),
    ("client_portal", "/client-portal", "Client portal", ("client portal",)),
    ("leads", "/leads", "Leads", ("leads", "lead", "crm", "sales")),
    ("payroll", "/payroll", "Payroll", ("payroll", "wages", "pay")),
    ("invoices", "/invoices", "Invoices", ("invoices", "invoice", "billing")),
    ("statements", "/statements", "Statements", ("statements", "statement")),
    ("custom_invoices", "/custom-invoices", "Custom Invoices", ("custom invoice", "custom invoices")),
    ("payments", "/payments", "Transactions", ("payments", "transactions", "payment")),
    ("expenses", "/expenses", "Expenses", ("expenses", "expense")),
    ("allowances", "/allowances", "Allowances", ("allowances", "allowance")),
    ("vendors", "/vendors", "Vendors", ("vendors", "vendor", "suppliers")),
    ("fixed_expenses", "/fixed-expenses", "Fixed Expenses", ("fixed expenses", "fixed expense")),
    ("recurring_invoices", "/recurring-invoices", "Recurring Invoices", ("recurring",)),
    ("chart_of_accounts", "/accounts", "Chart of Accounts", ("accounts", "chart of accounts", "coa")),
    ("reports", "/reports", "Reports", ("reports", "report")),
    ("company", "/settings/company", "Company settings", ("company", "settings", "profile")),
    ("billing", "/settings/billing", "Billing", ("subscription", "plan")),
    ("sms", "/settings/sms", "SMS", ("sms",)),
    ("email_settings", "/settings/email", "Email", ("email settings", "email")),
    ("recycle_bin", "/settings/recycle-bin", "Recycle Bin", ("recycle", "bin", "trash", "deleted")),
    ("roles", "/settings/roles", "Roles & permissions", ("roles", "permissions", "rbac")),
    ("special_days", "/settings/special-days", "Special days", ("special days", "bank holiday", "holidays")),
)


def _empty() -> dict[str, list]:
    return {k: [] for k in _EMPTY_KEYS}


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _hit(id_val: Any, name: str, href: str, subtitle: str | None = None) -> dict:
    out: dict[str, Any] = {"id": id_val if isinstance(id_val, int) else str(id_val), "name": name, "href": href}
    if subtitle:
        out["subtitle"] = subtitle
    return out


def _can(db: Session, user: User, module: str) -> bool:
    return user_has_permission_db(db, user, f"{module}.view")


def _tenant_flag_ok(company, module: str) -> bool:
    if module == "leads":
        return is_module_enabled(company, "leads")
    if module == "expenses":
        return is_module_enabled(company, "expenses")
    return True


def tenant_search(db: Session, user: User, q: str, *, limit: int = 8) -> dict:
    if (getattr(user, "role", None) or "").lower() == "super_admin":
        return _empty()
    term = (q or "").strip()
    if len(term) < 2:
        return _empty()
    try:
        company = get_company_by_user_id(db, user.id)
    except Exception:
        return _empty()

    like = f"%{_escape_like(term)}%"
    lim = max(1, min(int(limit or 8), 20))
    low = term.lower()
    out = _empty()
    cid = company.id

    def add(key: str, rows: list[dict]) -> None:
        out[key] = rows

    # —— Pages / module shortcuts ——
    if True:
        pages = []
        for module, href, label, aliases in _PAGE_HINTS:
            if not _can(db, user, module):
                continue
            if not _tenant_flag_ok(company, module):
                continue
            hay = " ".join((label, module, *aliases)).lower()
            if low in hay or any(a.startswith(low) or low in a for a in aliases) or low in label.lower():
                    pages.append(_hit(module, label, href, "Go to page"))
            if len(pages) >= lim:
                break
        add("pages", pages)

    # —— Staff ——
    if _can(db, user, "guards"):
        gq = db.query(Guard).filter(Guard.company_id == cid, Guard.deleted_at.is_(None))
        if is_staff_portal_user(user):
            linked = get_linked_guard(db, user)
            gq = gq.filter(Guard.id == (linked.id if linked else -1))
        elif is_client_portal_user(user):
            gq = gq.filter(Guard.id < 0)
        gq = gq.filter(
            or_(
                Guard.full_name.ilike(like, escape="\\"),
                Guard.email.ilike(like, escape="\\"),
                Guard.personal_email.ilike(like, escape="\\"),
                Guard.phone.ilike(like, escape="\\"),
                Guard.work_phone.ilike(like, escape="\\"),
                Guard.sia_number.ilike(like, escape="\\"),
                Guard.license_number.ilike(like, escape="\\"),
                Guard.badge_number.ilike(like, escape="\\"),
                Guard.payroll_number.ilike(like, escape="\\"),
                Guard.job_title.ilike(like, escape="\\"),
            )
        )
        guards = gq.order_by(Guard.full_name.asc()).limit(lim).all()
        add(
            "guards",
            [
                _hit(
                    g.id,
                    g.full_name,
                    f"/guards/{g.id}",
                    ", ".join(x for x in (g.job_title, g.sia_number or g.badge_number) if x) or None,
                )
                for g in guards
            ],
        )

    # —— Sites ——
    if _can(db, user, "sites"):
        sq = db.query(Site).filter(Site.company_id == cid, Site.deleted_at.is_(None))
        sq = filter_sites_for_user(db, user, sq)
        sq = sq.filter(
            or_(
                Site.name.ilike(like, escape="\\"),
                Site.address.ilike(like, escape="\\"),
                Site.postcode.ilike(like, escape="\\"),
                Site.reference.ilike(like, escape="\\"),
                Site.contact_person.ilike(like, escape="\\"),
                Site.contact_email.ilike(like, escape="\\"),
                Site.contact_phone.ilike(like, escape="\\"),
            )
        )
        sites = sq.order_by(Site.name.asc()).limit(lim).all()
        add(
            "sites",
            [_hit(s.id, s.name, f"/sites/{s.id}", s.postcode or s.address) for s in sites],
        )

    # —— Clients ——
    if _can(db, user, "clients"):
        cq = db.query(Client).filter(Client.company_id == cid, Client.deleted_at.is_(None))
        if is_client_portal_user(user):
            cq = cq.filter(Client.id == (user.client_id or -1))
        elif is_staff_portal_user(user):
            cq = cq.filter(Client.id < 0)
        cq = cq.filter(
            or_(
                Client.name.ilike(like, escape="\\"),
                Client.email.ilike(like, escape="\\"),
                Client.phone.ilike(like, escape="\\"),
                Client.contact_person.ilike(like, escape="\\"),
                Client.postcode.ilike(like, escape="\\"),
                Client.address.ilike(like, escape="\\"),
            )
        )
        clients = cq.order_by(Client.name.asc()).limit(lim).all()
        add(
            "clients",
            [_hit(c.id, c.name, f"/clients/{c.id}", c.contact_person or c.email) for c in clients],
        )

    # —— Invoices ——
    if _can(db, user, "invoices") and not is_portal_role(user):
        iq = db.query(Invoice).filter(Invoice.company_id == cid, Invoice.deleted_at.is_(None))
        filters = [
            Invoice.po_number.ilike(like, escape="\\"),
            Invoice.notes.ilike(like, escape="\\"),
            Invoice.status.ilike(like, escape="\\"),
            cast(Invoice.id, String).ilike(like, escape="\\"),
        ]
        if term.isdigit():
            filters.append(Invoice.id == int(term))
        iq = iq.outerjoin(Client, Client.id == Invoice.client_id).filter(
            or_(*filters, Client.name.ilike(like, escape="\\"))
        )
        invoices = iq.order_by(Invoice.id.desc()).limit(lim).all()
        add(
            "invoices",
            [
                _hit(
                    i.id,
                    f"Invoice #{i.id}",
                    f"/invoices/{i.id}/view",
                    (i.client.name if i.client else None) or (i.po_number and f"PO {i.po_number}") or i.status,
                )
                for i in invoices
            ],
        )

    # —— Credit notes ——
    if _can(db, user, "invoices") and not is_portal_role(user):
        cnq = (
            db.query(CreditNote)
            .filter(CreditNote.company_id == cid, CreditNote.deleted_at.is_(None))
            .filter(
                or_(
                    CreditNote.number.ilike(like, escape="\\"),
                    CreditNote.reason.ilike(like, escape="\\"),
                    cast(CreditNote.id, String).ilike(like, escape="\\"),
                )
            )
        )
        notes = cnq.order_by(CreditNote.id.desc()).limit(lim).all()
        add(
            "credit_notes",
            [
                _hit(n.id, n.number or f"Credit #{n.id}", f"/invoices/{n.invoice_id}/view", "Credit note")
                for n in notes
            ],
        )

    # —— Leads ——
    if _can(db, user, "leads") and _tenant_flag_ok(company, "leads") and not is_portal_role(user):
        lq = db.query(Lead).filter(Lead.company_id == cid, Lead.deleted_at.is_(None)).filter(
            or_(
                Lead.title.ilike(like, escape="\\"),
                Lead.organization.ilike(like, escape="\\"),
                Lead.contact_name.ilike(like, escape="\\"),
                Lead.email.ilike(like, escape="\\"),
                Lead.phone.ilike(like, escape="\\"),
                Lead.city.ilike(like, escape="\\"),
                Lead.postcode.ilike(like, escape="\\"),
            )
        )
        leads = lq.order_by(Lead.updated_at.desc()).limit(lim).all()
        add(
            "leads",
            [
                _hit(
                    L.id,
                    L.title or L.organization or f"Lead #{L.id}",
                    f"/leads/{L.id}",
                    ", ".join(x for x in (L.organization, L.contact_name, L.status) if x) or None,
                )
                for L in leads
            ],
        )

    # —— Rota plans ——
    if _can(db, user, "rota"):
        rq = db.query(RotaPlan).filter(RotaPlan.company_id == cid, RotaPlan.deleted_at.is_(None))
        if is_portal_role(user):
            rq = rq.filter(RotaPlan.status == "published")
        rq = rq.filter(
            or_(
                RotaPlan.name.ilike(like, escape="\\"),
                RotaPlan.status.ilike(like, escape="\\"),
                cast(RotaPlan.id, String).ilike(like, escape="\\"),
            )
        )
        plans = rq.order_by(RotaPlan.start_date.desc()).limit(lim).all()
        add(
            "rota_plans",
            [
                _hit(
                    p.id,
                    p.name,
                    "/rota",
                    f"{p.start_date} → {p.end_date} · {p.status}",
                )
                for p in plans
            ],
        )

    # —— Incidents ——
    if _can(db, user, "incidents"):
        iq = db.query(Incident).filter(Incident.company_id == cid, Incident.deleted_at.is_(None))
        if is_portal_role(user):
            site_ids = [
                r[0]
                for r in filter_sites_for_user(
                    db, user, db.query(Site.id).filter(Site.company_id == cid)
                ).all()
            ]
            iq = iq.filter(Incident.site_id.in_(site_ids or [-1]))
        iq = iq.filter(
            or_(
                Incident.notes.ilike(like, escape="\\"),
                Incident.category.ilike(like, escape="\\"),
                Incident.status.ilike(like, escape="\\"),
                cast(Incident.id, String).ilike(like, escape="\\"),
            )
        )
        incidents = iq.order_by(Incident.occurred_at.desc()).limit(lim).all()
        add(
            "incidents",
            [
                _hit(
                    i.id,
                    (i.notes or "")[:80] or f"Incident #{i.id}",
                    "/incidents",
                    f"{i.category or 'other'} · {i.status}",
                )
                for i in incidents
            ],
        )

    # —— Tasks ——
    if _can(db, user, "tasks"):
        tq = db.query(Task).filter(Task.company_id == cid, Task.deleted_at.is_(None))
        if is_staff_portal_user(user):
            linked = get_linked_guard(db, user)
            tq = tq.filter(Task.guard_id == (linked.id if linked else -1))
        elif is_client_portal_user(user):
            tq = tq.filter(Task.id < 0)
        tq = tq.filter(
            or_(
                Task.title.ilike(like, escape="\\"),
                Task.description.ilike(like, escape="\\"),
                Task.status.ilike(like, escape="\\"),
                Task.priority.ilike(like, escape="\\"),
            )
        )
        tasks = tq.order_by(Task.updated_at.desc()).limit(lim).all()
        add(
            "tasks",
            [_hit(t.id, t.title, "/tasks", f"{t.status} · {t.priority}") for t in tasks],
        )

    # —— Contractors ——
    if _can(db, user, "contractors") and not is_portal_role(user):
        cq = db.query(Contractor).filter(Contractor.company_id == cid, Contractor.deleted_at.is_(None)).filter(
            or_(
                Contractor.name.ilike(like, escape="\\"),
                Contractor.contact_email.ilike(like, escape="\\"),
                Contractor.contact_phone.ilike(like, escape="\\"),
                Contractor.postcode.ilike(like, escape="\\"),
            )
        )
        contractors = cq.order_by(Contractor.name.asc()).limit(lim).all()
        add(
            "contractors",
            [
                _hit(str(c.id), c.name, f"/contractors/{c.id}", getattr(c.type, "value", None) or str(c.type or ""))
                for c in contractors
            ],
        )

    # —— Documents ——
    if _can(db, user, "documents"):
        dq = (
            db.query(GuardDocument)
            .join(Guard, Guard.id == GuardDocument.guard_id)
            .filter(Guard.company_id == cid, GuardDocument.deleted_at.is_(None), Guard.deleted_at.is_(None))
        )
        if is_staff_portal_user(user):
            linked = get_linked_guard(db, user)
            dq = dq.filter(GuardDocument.guard_id == (linked.id if linked else -1), GuardDocument.visible_to_employee.is_(True))
        elif is_client_portal_user(user):
            dq = dq.filter(GuardDocument.id < 0)
        dq = dq.filter(
            or_(
                GuardDocument.file_name.ilike(like, escape="\\"),
                GuardDocument.document_type.ilike(like, escape="\\"),
                GuardDocument.folder.ilike(like, escape="\\"),
                Guard.full_name.ilike(like, escape="\\"),
            )
        )
        docs = dq.order_by(GuardDocument.created_at.desc()).limit(lim).all()
        add(
            "documents",
            [
                _hit(
                    d.id,
                    d.file_name or d.document_type or f"Document #{d.id}",
                    f"/documents/{d.id}",
                    d.guard.full_name if d.guard else d.document_type,
                )
                for d in docs
            ],
        )

    # —— Patrol routes ——
    if _can(db, user, "patrol"):
        pq = db.query(PatrolRoute).filter(PatrolRoute.company_id == cid, PatrolRoute.deleted_at.is_(None))
        if is_portal_role(user):
            site_ids = [
                r[0]
                for r in filter_sites_for_user(
                    db, user, db.query(Site.id).filter(Site.company_id == cid)
                ).all()
            ]
            pq = pq.filter(PatrolRoute.site_id.in_(site_ids or [-1]))
        pq = pq.filter(
            or_(
                PatrolRoute.name.ilike(like, escape="\\"),
                PatrolRoute.status.ilike(like, escape="\\"),
            )
        )
        routes = pq.order_by(PatrolRoute.name.asc()).limit(lim).all()
        add(
            "patrol_routes",
            [_hit(r.id, r.name, f"/patrol/routes/{r.id}", r.status) for r in routes],
        )

    # —— Accident reports ——
    if _can(db, user, "accident_reports"):
        aq = db.query(AccidentReport).filter(AccidentReport.company_id == cid, AccidentReport.deleted_at.is_(None))
        if is_portal_role(user):
            site_ids = [
                r[0]
                for r in filter_sites_for_user(
                    db, user, db.query(Site.id).filter(Site.company_id == cid)
                ).all()
            ]
            aq = aq.filter(AccidentReport.site_id.in_(site_ids or [-1]))
        aq = aq.filter(
            or_(
                AccidentReport.reference.ilike(like, escape="\\"),
                AccidentReport.supervisor_name.ilike(like, escape="\\"),
                AccidentReport.accident_type.ilike(like, escape="\\"),
                AccidentReport.accident_location.ilike(like, escape="\\"),
                AccidentReport.persons_involved.ilike(like, escape="\\"),
                cast(AccidentReport.id, String).ilike(like, escape="\\"),
            )
        )
        rows = aq.order_by(AccidentReport.report_date.desc()).limit(lim).all()
        add(
            "accident_reports",
            [
                _hit(
                    a.id,
                    a.reference or f"Accident #{a.id}",
                    "/accident-reports",
                    a.accident_type or a.supervisor_name,
                )
                for a in rows
            ],
        )

    # —— Occurrence sheets ——
    if _can(db, user, "occurrence_sheets"):
        oq = db.query(OccurrenceSheet).filter(OccurrenceSheet.company_id == cid, OccurrenceSheet.deleted_at.is_(None))
        if is_portal_role(user):
            site_ids = [
                r[0]
                for r in filter_sites_for_user(
                    db, user, db.query(Site.id).filter(Site.company_id == cid)
                ).all()
            ]
            oq = oq.filter(OccurrenceSheet.site_id.in_(site_ids or [-1]))
        oq = oq.filter(
            or_(
                OccurrenceSheet.reference.ilike(like, escape="\\"),
                OccurrenceSheet.officer_names.ilike(like, escape="\\"),
                cast(OccurrenceSheet.id, String).ilike(like, escape="\\"),
            )
        )
        sheets = oq.order_by(OccurrenceSheet.sheet_date.desc()).limit(lim).all()
        add(
            "occurrence_sheets",
            [
                _hit(
                    s.id,
                    s.reference or f"Sheet #{s.id}",
                    "/occurrence-sheets",
                    str(s.sheet_date) if s.sheet_date else None,
                )
                for s in sheets
            ],
        )

    # —— Expenses ——
    if _can(db, user, "expenses") and _tenant_flag_ok(company, "expenses") and not is_portal_role(user):
        eq = db.query(Expense).filter(Expense.company_id == cid, Expense.deleted_at.is_(None)).filter(
            or_(
                Expense.category.ilike(like, escape="\\"),
                Expense.vendor_name.ilike(like, escape="\\"),
                Expense.reference_number.ilike(like, escape="\\"),
                Expense.description.ilike(like, escape="\\"),
            )
        )
        expenses = eq.order_by(Expense.expense_date.desc()).limit(lim).all()
        add(
            "expenses",
            [
                _hit(
                    e.id,
                    e.vendor_name or e.category or f"Expense #{e.id}",
                    "/expenses",
                    f"{e.category} · £{float(e.total_amount or 0):,.2f}",
                )
                for e in expenses
            ],
        )

    # —— Vendors ——
    if _can(db, user, "vendors") and not is_portal_role(user):
        vq = db.query(Vendor).filter(Vendor.company_id == cid, Vendor.deleted_at.is_(None)).filter(
            or_(
                Vendor.name.ilike(like, escape="\\"),
                Vendor.email.ilike(like, escape="\\"),
                Vendor.phone.ilike(like, escape="\\"),
            )
        )
        vendors = vq.order_by(Vendor.name.asc()).limit(lim).all()
        add("vendors", [_hit(v.id, v.name, "/vendors", v.email or v.phone) for v in vendors])

    # —— Allowances ——
    if _can(db, user, "allowances") and not is_portal_role(user):
        aq = db.query(Allowance).filter(Allowance.company_id == cid, Allowance.deleted_at.is_(None)).filter(
            Allowance.name.ilike(like, escape="\\")
        )
        allowances = aq.order_by(Allowance.name.asc()).limit(lim).all()
        add(
            "allowances",
            [_hit(a.id, a.name, "/allowances", f"£{float(a.amount or 0):,.2f}") for a in allowances],
        )

    # —— Payroll ——
    if _can(db, user, "payroll") and not is_portal_role(user):
        pq = (
            db.query(Payroll)
            .join(Guard, Guard.id == Payroll.guard_id)
            .filter(Payroll.company_id == cid, Payroll.deleted_at.is_(None))
            .filter(
                or_(
                    Guard.full_name.ilike(like, escape="\\"),
                    cast(Payroll.id, String).ilike(like, escape="\\"),
                )
            )
        )
        payrolls = pq.order_by(Payroll.period_start.desc()).limit(lim).all()
        add(
            "payrolls",
            [
                _hit(
                    p.id,
                    p.guard.full_name if p.guard else f"Payroll #{p.id}",
                    "/payroll",
                    f"{p.period_start} → {p.period_end}",
                )
                for p in payrolls
            ],
        )

    # —— Payments ——
    if _can(db, user, "payments") and not is_portal_role(user):
        pay_filters = [
            Payment.method.ilike(like, escape="\\"),
            cast(Payment.id, String).ilike(like, escape="\\"),
            cast(Payment.invoice_id, String).ilike(like, escape="\\"),
        ]
        if term.isdigit():
            pay_filters.extend([Payment.id == int(term), Payment.invoice_id == int(term)])
        payments = (
            db.query(Payment)
            .filter(Payment.company_id == cid, Payment.deleted_at.is_(None), or_(*pay_filters))
            .order_by(Payment.paid_at.desc())
            .limit(lim)
            .all()
        )
        add(
            "payments",
            [
                _hit(
                    p.id,
                    f"Payment #{p.id}",
                    "/payments",
                    f"Invoice #{p.invoice_id} · £{float(p.amount or 0):,.2f}",
                )
                for p in payments
            ],
        )

    # —— Staff requests ——
    if _can(db, user, "staff_requests") or _can(db, user, "client_portal"):
        rq = db.query(StaffRequest).filter(StaffRequest.company_id == cid)
        if is_client_portal_user(user):
            rq = rq.filter(StaffRequest.client_id == (user.client_id or -1))
        elif is_staff_portal_user(user):
            rq = rq.filter(StaffRequest.id < 0)
        rq = rq.filter(
            or_(
                StaffRequest.client_notes.ilike(like, escape="\\"),
                StaffRequest.status.ilike(like, escape="\\"),
                cast(StaffRequest.id, String).ilike(like, escape="\\"),
            )
        )
        reqs = rq.order_by(StaffRequest.created_at.desc()).limit(lim).all()
        add(
            "staff_requests",
            [
                _hit(
                    r.id,
                    f"Request #{r.id}",
                    "/requests" if not is_client_portal_user(user) else "/client-portal/request-staff",
                    f"{r.shift_date} · {r.status}",
                )
                for r in reqs
            ],
        )

    # —— Chart of accounts ——
    if _can(db, user, "chart_of_accounts") and not is_portal_role(user):
        aq = db.query(Account).filter(Account.company_id == cid).filter(
            or_(
                Account.code.ilike(like, escape="\\"),
                Account.name.ilike(like, escape="\\"),
            )
        )
        accounts = aq.order_by(Account.code.asc()).limit(lim).all()
        add(
            "accounts",
            [_hit(a.id, f"{a.code} — {a.name}", "/accounts", a.account_type) for a in accounts],
        )

    return out
