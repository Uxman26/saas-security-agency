"""The Employee Hub: one query behind both Teams View and List View.

Both views show the same people with the same filters — the only difference is whether
they arrive grouped by team or flat — so they are answered here once and the client picks
which shape to render.

Three things the hub has to get right:

* **Terminated staff are not archived staff.** Someone with a leaving date keeps their
  record and their history and comes back the moment the "include terminated employees"
  switch is on. An archived record is hidden outright and only the Archived tab reaches
  it. The two are independent.
* **"Not registered" means no portal login**, not missing data — it is the prompt to
  invite people in, so it counts staff with no ``User`` row pointing at them.
* **Everyone is in a group.** Staff in no team land in the "No team" bucket rather than
  dropping out of the Teams View, which is what makes the two views agree on totals.
"""

from __future__ import annotations

from typing import List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import Guard, User
from app.services import team_service
from app.services.company_service import get_company_by_user_id
from app.services.work_filters import resolve_work_scope

SORT_OPTIONS = {
    "first_name_asc": "First name (A – Z)",
    "first_name_desc": "First name (Z – A)",
    "last_name_asc": "Last name (A – Z)",
    "last_name_desc": "Last name (Z – A)",
    "job_title_asc": "Job title (A – Z)",
    "recent": "Recently added",
}

STATUS_OPTIONS = {
    "all": "All",
    "active": "Active",
    "terminated": "Terminated",
    "registered": "Registered",
    "not_registered": "Not registered",
}


def _registered_guard_ids(db: Session, company_id: int) -> set[int]:
    rows = (
        db.query(User.guard_id)
        .filter(User.company_id == company_id, User.guard_id.isnot(None))
        .distinct()
        .all()
    )
    return {r[0] for r in rows if r[0]}


def _sort_key(sort: str):
    def key(row: Guard):
        name = (row.full_name or "").strip().lower()
        last = (row.last_name or name.split(" ")[-1] if name else "").strip().lower()
        if sort == "last_name_asc":
            return (last, name)
        if sort == "last_name_desc":
            return (last, name)
        if sort == "job_title_asc":
            return ((row.job_title or "").strip().lower(), name)
        if sort == "recent":
            return (-(row.id or 0),)
        return (name,)

    return key


def list_employee_hub(
    db: Session,
    user_id: int,
    *,
    search: Optional[str] = None,
    team_id: Optional[int] = None,
    status: str = "all",
    sort: str = "first_name_asc",
    include_terminated: bool = False,
    view: str = "active",
    client_id: Optional[int] = None,
    site_id: Optional[int] = None,
    contractor_id: Optional[str] = None,
    sub_contractor_id: Optional[str] = None,
    job_title: Optional[str] = None,
) -> dict:
    company = get_company_by_user_id(db, user_id)

    q = db.query(Guard).filter(Guard.company_id == company.id)
    if view == "archived":
        q = q.filter(Guard.deleted_at.isnot(None))
    elif view == "all":
        pass
    else:
        q = q.filter(Guard.deleted_at.is_(None))

    term = (search or "").strip()
    if term:
        like = f"%{term}%"
        # What the Find box offers, per the spec: a name or a job title.
        q = q.filter(or_(Guard.full_name.ilike(like), Guard.job_title.ilike(like)))

    # The same Client / Site / Contractor / Job title scope the rest of the app filters
    # on, so the hub agrees with Payroll, Rota and Invoices.
    scope = resolve_work_scope(
        db,
        company.id,
        client_id=client_id,
        site_id=site_id,
        contractor_id=contractor_id,
        sub_contractor_id=sub_contractor_id,
        job_title=job_title,
    )
    rows: List[Guard] = q.all()
    if scope.active:
        from app.services.work_filters import guard_ids_for_scope

        allowed = guard_ids_for_scope(db, company.id, scope)
        if allowed is not None:
            rows = [g for g in rows if g.id in allowed]

    registered = _registered_guard_ids(db, company.id)
    teams_by_guard = team_service.teams_by_guard(db, company.id)

    terminated_count = sum(1 for g in rows if g.termination_date is not None)
    if not include_terminated and status != "terminated":
        rows = [g for g in rows if g.termination_date is None]

    if team_id is not None:
        if team_id == team_service.NO_TEAM_ID:
            rows = [g for g in rows if not teams_by_guard.get(g.id)]
        else:
            rows = [g for g in rows if any(t["id"] == team_id for t in teams_by_guard.get(g.id, []))]

    if status == "active":
        rows = [g for g in rows if g.termination_date is None]
    elif status == "terminated":
        rows = [g for g in rows if g.termination_date is not None]
    elif status == "registered":
        rows = [g for g in rows if g.id in registered]
    elif status == "not_registered":
        rows = [g for g in rows if g.id not in registered]

    sort = sort if sort in SORT_OPTIONS else "first_name_asc"
    rows.sort(key=_sort_key(sort), reverse=sort.endswith("_desc"))

    def to_row(g: Guard) -> dict:
        return {
            "id": g.id,
            "full_name": g.full_name,
            "job_title": g.job_title,
            "email": g.email,
            "phone": g.phone or g.work_phone,
            "photo_url": g.photo_url,
            "teams": teams_by_guard.get(g.id, []),
            "terminated": g.termination_date is not None,
            "termination_date": g.termination_date,
            "registered": g.id in registered,
            "archived": g.deleted_at is not None,
        }

    employees = [to_row(g) for g in rows]

    # Groups keep the sort order within each team, and "No team" sits last so the named
    # teams read first.
    named = {t["id"]: t["name"] for t in team_service.list_teams(db, user_id)}
    grouped: dict[int, list[dict]] = {}
    for row in employees:
        ids = [t["id"] for t in row["teams"]] or [team_service.NO_TEAM_ID]
        for tid in ids:
            grouped.setdefault(tid, []).append(row)

    groups = [
        {"team_id": tid, "team_name": named.get(tid, "Unknown team"), "employees": members}
        for tid, members in sorted(grouped.items(), key=lambda kv: named.get(kv[0], "").lower())
        if tid != team_service.NO_TEAM_ID
    ]
    if team_service.NO_TEAM_ID in grouped:
        groups.append(
            {
                "team_id": team_service.NO_TEAM_ID,
                "team_name": team_service.NO_TEAM_NAME,
                "employees": grouped[team_service.NO_TEAM_ID],
            }
        )

    return {
        "total": len(employees),
        "not_registered": sum(1 for e in employees if not e["registered"]),
        "terminated_count": terminated_count,
        "groups": groups,
        "employees": employees,
    }
