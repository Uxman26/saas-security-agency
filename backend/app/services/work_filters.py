"""One shared reading of the Client / Site / Contractor / Sub-contractor / Staff /
Job title filters used by Payroll, Rota and Invoices.

Every one of those screens filters the same underlying thing — a shift, or a document
derived from shifts — so the rules live here once rather than three times over.

Two things this module exists to get right:

*Client means all of that client's sites.* A client can own ten sites, and picking the
client has to bring back every shift on all ten without the user ticking them one by
one. So a client filter resolves to a set of site ids at the edge, and nothing
downstream ever sees "client" again.

*Contractor links hang off both sides.* A contractor can own the site, the staff, or
both, and older records carry the legacy ``main_contractor_id`` / ``sub_contractor_id``
integer columns while newer ones use the directory ``Contractor`` UUID. A row therefore
matches a contractor filter when *either* its site or its staff member is linked to that
contractor, by either link style — the same rule the Staff list already applies, so a
filter never quietly hides people whose link predates the directory.

Filters combine with AND: pick a client and a job title and you get that job title on
that client's sites.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable, List, Optional, Set, Tuple
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import (
    Assignment,
    Contractor,
    ContractorAssignment,
    Guard,
    MainContractor,
    Site,
    SubContractor,
)

__all__ = [
    "WorkScope",
    "EMPTY_SCOPE",
    "resolve_work_scope",
    "guard_ids_for_scope",
    "site_ids_for_client",
]


def _as_uuid(raw: Any) -> Optional[UUID]:
    if isinstance(raw, UUID):
        return raw
    try:
        return UUID(str(raw))
    except (TypeError, ValueError, AttributeError):
        return None


def _as_int(raw: Any) -> Optional[int]:
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError, AttributeError):
        return None


def _intersect(current: Optional[Set[int]], addition: Set[int]) -> Set[int]:
    return addition if current is None else (current & addition)


@dataclass(frozen=True)
class WorkScope:
    """Which sites and which staff the caller's filters leave in play.

    ``None`` on a field means "not restricted"; an empty set means "restricted to
    nothing", which is a real answer — a client with no sites yet matches no shifts —
    and must not be confused with the unrestricted case.

    ``contractor_pairs`` holds one (site ids, guard ids) pair per contractor-style
    filter. A row satisfies a pair when its site *or* its guard is in that pair, and it
    must satisfy every pair.
    """

    site_ids: Optional[frozenset] = None
    guard_ids: Optional[frozenset] = None
    contractor_pairs: Tuple[Tuple[frozenset, frozenset], ...] = ()

    @property
    def active(self) -> bool:
        return self.site_ids is not None or self.guard_ids is not None or bool(self.contractor_pairs)

    def matches(self, site_id: Optional[int], guard_id: Optional[int]) -> bool:
        """Whether one shift-shaped row survives the filters. Used for planner rows,
        which live in JSON and never see the database."""
        if self.site_ids is not None and (site_id is None or site_id not in self.site_ids):
            return False
        if self.guard_ids is not None and (guard_id is None or guard_id not in self.guard_ids):
            return False
        for sites, guards in self.contractor_pairs:
            by_site = site_id is not None and site_id in sites
            by_guard = guard_id is not None and guard_id in guards
            if not (by_site or by_guard):
                return False
        return True

    def sql_criteria(self, site_col, guard_col) -> List:
        """The same rule as :meth:`matches`, for a query over columns holding a site id
        and a guard id."""
        crits: List = []
        if self.site_ids is not None:
            crits.append(site_col.in_(tuple(self.site_ids)))
        if self.guard_ids is not None:
            crits.append(guard_col.in_(tuple(self.guard_ids)))
        for sites, guards in self.contractor_pairs:
            crits.append(or_(site_col.in_(tuple(sites)), guard_col.in_(tuple(guards))))
        return crits

    def apply(self, query, site_col, guard_col):
        crits = self.sql_criteria(site_col, guard_col)
        return query.filter(*crits) if crits else query


EMPTY_SCOPE = WorkScope()


def site_ids_for_client(db: Session, company_id: int, client_id: int) -> Set[int]:
    """Every site assigned to the client. This is the whole point of the client filter:
    one pick has to cover all ten sites."""
    rows = (
        db.query(Site.id)
        .filter(Site.company_id == company_id, Site.client_id == client_id)
        .all()
    )
    return {r[0] for r in rows}


def _legacy_model(kind: str):
    return MainContractor if kind == "main" else SubContractor


def _legacy_ids_named(db: Session, company_id: int, kind: str, names: Iterable[str]) -> Set[int]:
    wanted = {n.strip().lower() for n in names if n and n.strip()}
    if not wanted:
        return set()
    model = _legacy_model(kind)
    rows = db.query(model.id, model.name).filter(model.company_id == company_id).all()
    return {rid for rid, name in rows if (name or "").strip().lower() in wanted}


def _directory_ids_named(db: Session, company_id: int, names: Iterable[str]) -> Set[UUID]:
    wanted = {n.strip().lower() for n in names if n and n.strip()}
    if not wanted:
        return set()
    rows = db.query(Contractor.id, Contractor.name).filter(Contractor.company_id == company_id).all()
    return {cid for cid, name in rows if (name or "").strip().lower() in wanted}


def _contractor_refs(db: Session, company_id: int, raw: Any, kind: str) -> Tuple[Set[UUID], Set[int]]:
    """Resolve one contractor pick into (directory ids, legacy ids).

    Callers may hand us either style of id — the pickers offer the directory, older
    saved filters and integrations may still carry a legacy id — and either one is
    widened to cover the same contractor recorded the other way, matched by name.
    """
    directory: Set[UUID] = set()
    legacy: Set[int] = set()
    names: Set[str] = set()

    as_uuid = _as_uuid(raw)
    if as_uuid is not None:
        row = (
            db.query(Contractor)
            .filter(Contractor.id == as_uuid, Contractor.company_id == company_id)
            .first()
        )
        if not row:
            # Unknown id: match nothing rather than silently ignoring the filter.
            return set(), set()
        directory.add(row.id)
        if row.name:
            names.add(row.name)
    else:
        as_int = _as_int(raw)
        if as_int is None:
            return set(), set()
        model = _legacy_model(kind)
        row = db.query(model).filter(model.id == as_int, model.company_id == company_id).first()
        if not row:
            return set(), set()
        legacy.add(row.id)
        if row.name:
            names.add(row.name)

    legacy |= _legacy_ids_named(db, company_id, kind, names)
    directory |= _directory_ids_named(db, company_id, names)
    return directory, legacy


def _contractor_pair(db: Session, company_id: int, raw: Any, kind: str) -> Tuple[frozenset, frozenset]:
    """The sites and the staff that count as belonging to one contractor."""
    directory, legacy = _contractor_refs(db, company_id, raw, kind)
    if not directory and not legacy:
        return frozenset(), frozenset()

    site_col = Site.main_contractor_id if kind == "main" else Site.sub_contractor_id
    guard_col = Guard.main_contractor_id if kind == "main" else Guard.sub_contractor_id

    site_clauses = []
    guard_clauses = []
    if directory:
        site_clauses.append(Site.contractor_id.in_(tuple(directory)))
        guard_clauses.append(Guard.contractor_id.in_(tuple(directory)))
    if legacy:
        site_clauses.append(site_col.in_(tuple(legacy)))
        guard_clauses.append(guard_col.in_(tuple(legacy)))

    sites = {
        r[0]
        for r in db.query(Site.id)
        .filter(Site.company_id == company_id, or_(*site_clauses))
        .all()
    }
    guards = {
        r[0]
        for r in db.query(Guard.id)
        .filter(Guard.company_id == company_id, or_(*guard_clauses))
        .all()
    }

    # A contractor can also reach a site through the contractor directory's own
    # assignments table rather than the site record itself.
    if directory:
        assign_col = (
            ContractorAssignment.main_contractor_id
            if kind == "main"
            else ContractorAssignment.sub_contractor_id
        )
        rows = (
            db.query(ContractorAssignment.site_id)
            .filter(
                ContractorAssignment.company_id == company_id,
                assign_col.in_(tuple(directory)),
                ContractorAssignment.site_id.isnot(None),
            )
            .all()
        )
        sites |= {r[0] for r in rows if r[0] is not None}

    return frozenset(sites), frozenset(guards)


def _guard_ids_with_job_title(db: Session, company_id: int, job_title: str) -> Set[int]:
    wanted = job_title.strip().lower()
    rows = (
        db.query(Guard.id)
        .filter(
            Guard.company_id == company_id,
            func.lower(func.trim(Guard.job_title)) == wanted,
        )
        .all()
    )
    return {r[0] for r in rows}


def resolve_work_scope(
    db: Session,
    company_id: int,
    *,
    client_id: Optional[int] = None,
    site_id: Optional[int] = None,
    contractor_id: Any = None,
    sub_contractor_id: Any = None,
    guard_id: Optional[int] = None,
    job_title: Optional[str] = None,
) -> WorkScope:
    """Turn the six filter values a screen can send into a reusable scope.

    An id that does not belong to this company resolves to "matches nothing" rather
    than being dropped — dropping it would quietly widen the result past what was asked
    for, and past what the caller may see.
    """
    sites: Optional[Set[int]] = None
    guards: Optional[Set[int]] = None
    pairs: List[Tuple[frozenset, frozenset]] = []

    if client_id:
        sites = _intersect(sites, site_ids_for_client(db, company_id, client_id))

    if site_id:
        owned = (
            db.query(Site.id)
            .filter(Site.id == site_id, Site.company_id == company_id)
            .first()
        )
        sites = _intersect(sites, {site_id} if owned else set())

    if guard_id:
        owned = (
            db.query(Guard.id)
            .filter(Guard.id == guard_id, Guard.company_id == company_id)
            .first()
        )
        guards = _intersect(guards, {guard_id} if owned else set())

    if job_title and job_title.strip():
        guards = _intersect(guards, _guard_ids_with_job_title(db, company_id, job_title))

    if contractor_id:
        pairs.append(_contractor_pair(db, company_id, contractor_id, "main"))
    if sub_contractor_id:
        pairs.append(_contractor_pair(db, company_id, sub_contractor_id, "sub"))

    return WorkScope(
        site_ids=None if sites is None else frozenset(sites),
        guard_ids=None if guards is None else frozenset(guards),
        contractor_pairs=tuple(pairs),
    )


def _guards_rotad_at_sites(
    db: Session,
    company_id: int,
    site_ids: Iterable[int],
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
) -> Set[int]:
    ids = tuple(site_ids)
    if not ids:
        return set()
    q = (
        db.query(Assignment.guard_id)
        .join(Guard, Assignment.guard_id == Guard.id)
        .filter(Guard.company_id == company_id, Assignment.site_id.in_(ids))
    )
    if period_start:
        q = q.filter(Assignment.date >= period_start)
    if period_end:
        q = q.filter(Assignment.date <= period_end)
    return {r[0] for r in q.distinct().all()}


def guard_ids_for_scope(
    db: Session,
    company_id: int,
    scope: WorkScope,
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
) -> Optional[Set[int]]:
    """The scope expressed purely as a set of staff ids, or ``None`` when unrestricted.

    Payroll records carry a guard and a period but no site, so a site-side filter has to
    be answered through the rota: which staff were actually rota'd onto those sites in
    the period being asked about.
    """
    if not scope.active:
        return None

    allowed: Optional[Set[int]] = None if scope.guard_ids is None else set(scope.guard_ids)

    if scope.site_ids is not None:
        worked = _guards_rotad_at_sites(db, company_id, scope.site_ids, period_start, period_end)
        allowed = worked if allowed is None else (allowed & worked)

    for sites, guards in scope.contractor_pairs:
        worked = _guards_rotad_at_sites(db, company_id, sites, period_start, period_end)
        pair_guards = worked | set(guards)
        allowed = pair_guards if allowed is None else (allowed & pair_guards)

    return allowed
