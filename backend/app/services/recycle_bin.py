"""The Recycle Bin: one place every deleted record goes, and the only place it leaves from.

Deleting anything in the app now stamps ``deleted_at`` instead of issuing a DELETE. The row
stays exactly where it was, so everything that points at it still reads correctly — a shift
still names its site, an invoice still names its client, an audit entry still resolves — and
the deletion can be undone. What changes is visibility: a stamped row is invisible to every
ordinary read, enforced centrally by :func:`install_filter` rather than by each query
remembering to exclude it.

Two things can happen to a row in the bin, and only from here:

**Restore** clears the stamp and the record returns to its list.

**Permanent delete** issues the real DELETE, with whatever the ORM cascades from it. That
cannot be undone, so it is a separate permission (``<module>.delete_permanent``) from the
delete that put it in the bin.

Staff, clients and sites are listed here too but keep their own archive/restore endpoints and
their own referential checks, which predate this module and are richer than anything generic;
:data:`SELF_MANAGED` marks them so the filter below leaves their queries alone.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Optional

from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from app import models
from app.services import soft_delete


@dataclass(frozen=True)
class BinResource:
    key: str
    label: str
    plural: str
    model: type
    module: str
    title: Callable[[object], str]
    subtitle: Callable[[object], Optional[str]] = lambda row: None
    company_attr: Optional[str] = "company_id"
    # Runs just before a permanent delete, to release pointers the ORM will not cascade.
    before_purge: Optional[Callable[[Session, object], None]] = None
    # Staff / clients / sites came first and manage deleted_at themselves.
    self_managed: bool = False


def _s(value) -> str:
    return str(value).strip() if value not in (None, "") else ""


def _first(row, *attrs) -> str:
    for a in attrs:
        v = _s(getattr(row, a, None))
        if v:
            return v
    return ""


def _dated(row, label: str, *attrs) -> str:
    when = _first(row, *attrs)
    return f"{label} · {when}" if when else label


RESOURCES: tuple[BinResource, ...] = (
    BinResource(
        "guards", "Staff member", "Staff", models.Guard, "guards",
        lambda r: _first(r, "full_name") or f"Staff #{r.id}",
        lambda r: _s(getattr(r, "job_title", None)) or None,
        self_managed=True,
    ),
    BinResource(
        "clients", "Client", "Clients", models.Client, "clients",
        lambda r: _first(r, "name") or f"Client #{r.id}",
        lambda r: _s(getattr(r, "email", None)) or None,
        self_managed=True,
    ),
    BinResource(
        "sites", "Site", "Sites", models.Site, "sites",
        lambda r: _first(r, "name") or f"Site #{r.id}",
        lambda r: _s(getattr(r, "address", None)) or None,
        self_managed=True,
    ),
    BinResource(
        "rotas", "Rota", "Rotas", models.RotaPlan, "rota",
        lambda r: _first(r, "name") or f"Rota #{r.id}",
        lambda r: f"{r.start_date} – {r.end_date}" if r.start_date else None,
        before_purge=lambda db, row: db.query(models.ShiftAuditLog)
        .filter(models.ShiftAuditLog.rota_plan_id == row.id)
        .update({models.ShiftAuditLog.rota_plan_id: None}, synchronize_session=False),
    ),
    BinResource(
        "incidents", "Incident", "Incidents", models.Incident, "incidents",
        lambda r: _first(r, "category") or f"Incident #{r.id}",
        lambda r: _dated(r, "Incident", "occurred_at", "created_at"),
    ),
    BinResource(
        "accident_reports", "Accident report", "Accident reports", models.AccidentReport,
        "accident_reports",
        lambda r: _first(r, "reference") or f"Accident report #{r.id}",
        lambda r: _dated(r, "Report", "report_date", "created_at"),
    ),
    BinResource(
        "occurrence_sheets", "Occurrence sheet", "Occurrence sheets", models.OccurrenceSheet,
        "occurrence_sheets",
        lambda r: _first(r, "reference") or f"Occurrence sheet #{r.id}",
        lambda r: _dated(r, "Sheet", "sheet_date", "created_at"),
    ),
    BinResource(
        "tasks", "Task", "Tasks", models.Task, "tasks",
        lambda r: _first(r, "title") or f"Task #{r.id}",
        lambda r: _s(getattr(r, "status", None)) or None,
    ),
    BinResource(
        "invoices", "Invoice", "Invoices", models.Invoice, "invoices",
        lambda r: f"Invoice #{r.id}",
        lambda r: f"{getattr(r, 'period_start', '')} – {getattr(r, 'period_end', '')}".strip(" –") or None,
    ),
    BinResource(
        "payments", "Payment", "Payments", models.Payment, "payments",
        lambda r: f"Payment #{r.id}",
        lambda r: _dated(r, "Payment", "paid_at", "created_at"),
    ),
    BinResource(
        "expenses", "Expense", "Expenses", models.Expense, "expenses",
        lambda r: _first(r, "description", "vendor_name", "category") or f"Expense #{r.id}",
        lambda r: _dated(r, "Expense", "expense_date", "created_at"),
    ),
    BinResource(
        "payroll", "Payroll run", "Payroll", models.Payroll, "payroll",
        lambda r: f"Payroll #{r.id}",
        lambda r: f"{getattr(r, 'period_start', '')} – {getattr(r, 'period_end', '')}".strip(" –") or None,
    ),
    BinResource(
        "leads", "Lead", "Leads", models.Lead, "leads",
        lambda r: _first(r, "title", "organization", "contact_name", "email") or f"Lead #{r.id}",
        lambda r: _s(getattr(r, "status", None)) or None,
    ),
    BinResource(
        "teams", "Team", "Teams", models.Team, "guards",
        lambda r: _first(r, "name") or f"Team #{r.id}",
    ),
    BinResource(
        "job_titles", "Job title", "Job titles", models.JobTitle, "guards",
        lambda r: _first(r, "name") or f"Job title #{r.id}",
    ),
    BinResource(
        "absences", "Absence", "Absences", models.AbsenceRecord, "absence",
        lambda r: _first(r, "kind", "reason") or f"Absence #{r.id}",
        lambda r: f"{getattr(r, 'start_date', '')} – {getattr(r, 'end_date', '')}".strip(" –") or None,
    ),
    BinResource(
        "allowances", "Allowance", "Allowances", models.Allowance, "allowances",
        lambda r: _first(r, "name") or f"Allowance #{r.id}",
    ),
    BinResource(
        "special_days", "Special day", "Special days", models.SpecialDay, "special_days",
        lambda r: _first(r, "label") or f"Special day #{r.id}",
        lambda r: _s(getattr(r, "date", None)) or None,
    ),
    BinResource(
        "patrol_routes", "Patrol route", "Patrol routes", models.PatrolRoute, "patrol",
        lambda r: _first(r, "name") or f"Patrol route #{r.id}",
    ),
    BinResource(
        "lone_worker_policies", "Lone worker policy", "Lone worker policies",
        models.LoneWorkerPolicy, "lone_worker",
        lambda r: _first(r, "name") or f"Policy #{r.id}",
    ),
    BinResource(
        "contractors", "Contractor", "Contractors", models.Contractor, "contractors",
        lambda r: _first(r, "name") or f"Contractor {r.id}",
    ),
    BinResource(
        "main_contractors", "Main contractor", "Main contractors", models.MainContractor,
        "contractors",
        lambda r: _first(r, "name") or f"Main contractor #{r.id}",
    ),
    BinResource(
        "sub_contractors", "Sub contractor", "Sub contractors", models.SubContractor,
        "sub_contractors",
        lambda r: _first(r, "name") or f"Sub contractor #{r.id}",
    ),
    BinResource(
        "documents", "Document", "Documents", models.GuardDocument, "documents",
        lambda r: _first(r, "file_name") or f"Document #{r.id}",
        lambda r: _s(getattr(r, "document_type", None)) or None,
        company_attr=None,
    ),
)

BY_KEY: dict[str, BinResource] = {r.key: r for r in RESOURCES}

# Everything the global filter hides. The self-managed three are left out on purpose: their
# services already decide when an archived row should be visible (restoring one, or refusing
# an edit with "restore it first"), and a blanket filter would turn those into 404s.
FILTERED_MODELS: tuple[type, ...] = tuple(r.model for r in RESOURCES if not r.self_managed)

SELF_MANAGED: tuple[type, ...] = tuple(r.model for r in RESOURCES if r.self_managed)


def install_filter() -> None:
    """Hide soft-deleted rows from every ORM read that has not explicitly asked for them.

    Doing this once, centrally, is the difference between soft delete being a property of the
    data and it being a convention that every future query has to remember. A query opts out
    with ``.execution_options(include_deleted=True)`` — which only the bin itself, and the
    restore paths, ever do.
    """
    criteria = [
        with_loader_criteria(m, m.deleted_at.is_(None), include_aliases=True)
        for m in FILTERED_MODELS
    ]

    @event.listens_for(Session, "do_orm_execute")
    def _hide_deleted(orm_context):
        if orm_context.is_column_load or orm_context.is_relationship_load:
            return
        if not orm_context.is_select:
            return
        if orm_context.execution_options.get("include_deleted"):
            return
        for c in criteria:
            orm_context.statement = orm_context.statement.options(c)


def _scope(db: Session, res: BinResource, company_id: int):
    q = db.query(res.model).execution_options(include_deleted=True)
    if res.company_attr:
        return q.filter(getattr(res.model, res.company_attr) == company_id)
    # Documents hang off a guard rather than carrying the company themselves.
    return q.join(models.Guard, models.Guard.id == res.model.guard_id).filter(
        models.Guard.company_id == company_id
    )


def _coerce_id(res: BinResource, raw: str):
    col = res.model.__table__.c["id"]
    if col.type.python_type is int:
        try:
            return int(raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=404, detail=f"{res.label} not found")
    return raw


def get_row(db: Session, res: BinResource, company_id: int, raw_id: str):
    row = _scope(db, res, company_id).filter(res.model.id == _coerce_id(res, raw_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"{res.label} not found")
    return row


def _entry(db: Session, res: BinResource, row, names: dict[int, str]) -> dict:
    return {
        "resource": res.key,
        "resource_label": res.label,
        "id": str(row.id),
        "title": res.title(row),
        "subtitle": res.subtitle(row),
        "deleted_at": row.deleted_at,
        "deleted_by": names.get(getattr(row, "deleted_by_user_id", None) or 0),
    }


def list_bin(db: Session, company_id: int, resource: Optional[str] = None, search: str = "") -> dict:
    keys = [resource] if resource else list(BY_KEY)
    if resource and resource not in BY_KEY:
        raise HTTPException(status_code=400, detail="Unknown resource")

    entries: list[dict] = []
    counts: dict[str, int] = {}
    actor_ids: set[int] = set()
    rows_by_res: list[tuple[BinResource, list]] = []

    for key in keys:
        res = BY_KEY[key]
        rows = (
            _scope(db, res, company_id)
            .filter(res.model.deleted_at.isnot(None))
            .order_by(res.model.deleted_at.desc())
            .all()
        )
        counts[key] = len(rows)
        rows_by_res.append((res, rows))
        actor_ids.update(
            int(getattr(r, "deleted_by_user_id", None) or 0) for r in rows
        )

    actor_ids.discard(0)
    names = {
        u.id: u.full_name
        for u in db.query(models.User).filter(models.User.id.in_(actor_ids)).all()
    } if actor_ids else {}

    needle = (search or "").strip().lower()
    for res, rows in rows_by_res:
        for row in rows:
            e = _entry(db, res, row, names)
            if needle and needle not in f"{e['title']} {e['subtitle'] or ''}".lower():
                continue
            entries.append(e)

    entries.sort(key=lambda e: (e["deleted_at"] is None, e["deleted_at"]), reverse=True)
    return {
        "items": entries,
        "counts": counts,
        "total": sum(counts.values()),
        "resources": [
            {"key": r.key, "label": r.label, "plural": r.plural, "module": r.module}
            for r in RESOURCES
        ],
    }


# Staff, clients and sites restore and destroy through their own services, which do more
# than flip a flag — disabling portal logins, refusing a delete that would orphan history,
# writing their own audit entries. The bin dispatches to them rather than reimplementing it.
_SELF_MANAGED_OPS: dict[str, tuple[str, str, str]] = {
    "guards": ("guard_service", "restore_guard", "delete_guard"),
    "clients": ("client_service", "restore_client", "delete_client"),
    "sites": ("site_service", "restore_site", "delete_site"),
}


def _self_managed_call(res: BinResource, which: int, db: Session, row_id, user_id: int) -> None:
    import importlib

    module_name, *fns = _SELF_MANAGED_OPS[res.key]
    mod = importlib.import_module(f"app.services.{module_name}")
    getattr(mod, fns[which])(db, row_id, user_id)


def restore(db: Session, res: BinResource, company_id: int, raw_id: str, user_id: int) -> None:
    row = get_row(db, res, company_id, raw_id)
    if not soft_delete.is_archived(row):
        return
    if res.key in _SELF_MANAGED_OPS:
        _self_managed_call(res, 0, db, row.id, user_id)
        return
    soft_delete.mark_restored(row)
    db.commit()


def purge(db: Session, res: BinResource, company_id: int, raw_id: str, user_id: int) -> None:
    row = get_row(db, res, company_id, raw_id)
    if res.key in _SELF_MANAGED_OPS and soft_delete.is_archived(row):
        _self_managed_call(res, 1, db, row.id, user_id)
        return
    if not soft_delete.is_archived(row):
        raise HTTPException(
            status_code=409,
            detail=f"This {res.label.lower()} is not in the bin. Delete it first.",
        )
    if res.before_purge:
        res.before_purge(db, row)
        db.flush()
    db.delete(row)
    db.commit()


def revive_if_binned(db: Session, model, user_id: int, **match):
    """Reuse a binned row whose unique key is being created again.

    Soft delete keeps the row, so it keeps its slot in any unique constraint — deleting
    the "Supervisor" job title and adding it back would otherwise fail on a raw database
    error. Re-adding the same name is, in practice, exactly the undo the bin exists for,
    so the binned row comes back rather than a second one being refused.

    Returns the revived row, or None when there was nothing in the bin to revive.
    """
    row = (
        db.query(model)
        .execution_options(include_deleted=True)
        .filter(model.deleted_at.isnot(None))
        .filter_by(**match)
        .first()
    )
    if not row:
        return None
    soft_delete.mark_restored(row)
    return row


def archive(row, user_id: int) -> None:
    """Put a row in the bin. Idempotent, so a repeated delete is not an error."""
    if getattr(row, "deleted_at", None) is None:
        row.deleted_at = datetime.now(timezone.utc)
        row.deleted_by_user_id = user_id
