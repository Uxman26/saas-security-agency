from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Any
from app.models import Site, Client, User
from app.schemas import SiteCreate
from app.services.company_service import get_company_by_user_id
from app.services.plan_enforcement import enforce_site_quota
from app.services import audit_service
from app.services import contractor_scope
from app.services import soft_delete


# Carried on SiteCreate to drive portal-login creation; not columns on Site, so they must
# never reach the model constructor or the update setattr loop.
_NON_COLUMN_FIELDS = ("create_login", "login_email", "login_full_name", "login_password")


def _site_payload(site) -> dict:
    data = site.model_dump() if hasattr(site, "model_dump") else site.dict()
    for f in _NON_COLUMN_FIELDS:
        data.pop(f, None)
    return data


def create_site(db: Session, site: SiteCreate, user_id: int) -> Site:
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    from app.services.portal_access import is_portal_role

    if user and is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    enforce_site_quota(db, company)
    if site.client_id and not db.query(Client).filter(Client.id == site.client_id, Client.company_id == company.id).first():
        raise HTTPException(status_code=400, detail="Client not found")
    data = _site_payload(site)
    data["name"] = " ".join(str(data.get("name") or "").split())
    _assert_name_free(db, company.id, data["name"])
    cid = data.pop("contractor_id", None)
    main_id = data.pop("main_contractor_id", None)
    sub_id = data.pop("sub_contractor_id", None)
    if cid is not None:
        if main_id is not None or sub_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Use either directory contractor (contractor_id) or legacy main/sub fields, not both.",
            )
        contractor_scope.resolve_directory_contractor_link(db, company.id, cid)
        next_cid, next_main, next_sub = cid, None, None
    else:
        next_main, next_sub = contractor_scope.apply_site_contractors(db, company.id, main_id, sub_id)
        next_cid = None
    db_site = Site(
        **data,
        company_id=company.id,
        contractor_id=next_cid,
        main_contractor_id=next_main,
        sub_contractor_id=next_sub,
    )
    db.add(db_site)
    db.flush()
    if getattr(site, "create_login", False):
        _create_site_login(db, db_site, company.id, site)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="create",
        entity_type="site",
        entity_id=db_site.id,
        meta={"name": data.get("name")},
    )
    db.commit()
    db.refresh(db_site)
    return db_site


def _create_site_login(db: Session, db_site: Site, company_id: int, data: SiteCreate) -> None:
    """Create a Client-role portal user pinned to this one site.

    The site does not need a client. A site with no client produces a standalone login
    scoped purely by its pin, which is what makes a site independent of any client; a
    site that does have one keeps the client link as well, so the same login still
    reads correctly if it is later widened to that client's other sites.

    Same transactional shape as client_service._create_client_login: every validation
    below (and inside create_company_user) raises before that function commits, so a
    rejected login leaves the flushed site row uncommitted and the request rolls back
    both together — no orphan site.
    """
    from app.schemas import CompanyUserCreate
    from app.services import role_service, user_service

    email = (data.login_email or data.contact_email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required to create a portal login")
    if not data.login_password:
        raise HTTPException(status_code=400, detail="Password is required to create a portal login")

    role = role_service.get_role_by_slug(db, company_id, "client")
    if not role:
        role_service.ensure_roles_for_company(db, company_id)
        role = role_service.get_role_by_slug(db, company_id, "client")
    if not role:
        raise HTTPException(status_code=500, detail="Client role is not configured for this company")

    full_name = (
        (data.login_full_name or "").strip()
        or (data.contact_person or "").strip()
        or db_site.name
    )
    user_service.create_company_user(
        db,
        company_id,
        CompanyUserCreate(
            email=email,
            password=data.login_password,
            full_name=full_name,
            role_id=role.id,
            client_id=db_site.client_id,
            site_ids=[db_site.id],
        ),
    )


def get_sites(db: Session, user_id: int, view: str = soft_delete.VIEW_ACTIVE) -> List[Site]:
    """Sites. Archived ones are left out unless ``view`` asks for them."""
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    q = soft_delete.apply_view(db.query(Site).filter(Site.company_id == company.id), Site, view)
    if user:
        from app.services.portal_access import filter_sites_for_user, is_portal_role

        if is_portal_role(user):
            q = filter_sites_for_user(db, user, q)
    return q.all()


def get_site_by_id(db: Session, site_id: int, user_id: int) -> Site:
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if user:
        from app.services.portal_access import filter_sites_for_user, is_portal_role

        if is_portal_role(user):
            allowed = filter_sites_for_user(db, user, db.query(Site).filter(Site.id == site_id)).first()
            if not allowed:
                raise HTTPException(status_code=404, detail="Site not found")
    return site


def _block_portal_roles(db: Session, user_id: int) -> None:
    """Site records are internal: they carry staff pay rates, billing rates and
    contractor links. A portal login reads sites, it never writes them, so the write
    paths refuse portal roles outright rather than trusting the module matrix — an
    admin ticking Edit on the Client role must not hand a customer the ability to
    rewrite their own rates.
    """
    from app.services.portal_access import is_portal_role

    user = db.query(User).filter(User.id == user_id).first()
    if user and is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def list_site_portal_logins(db: Session, site_id: int, user_id: int) -> List[User]:
    """The portal logins pinned to this site, for the Portal login panel on its edit screen.

    Only pinned logins count. A client login with no pins can see this site through its
    client, but it is not this site's login and must not be managed from here.
    """
    from app.models import UserSite

    site = get_site_by_id(db, site_id, user_id)
    _block_portal_roles(db, user_id)
    return (
        db.query(User)
        .join(UserSite, UserSite.user_id == User.id)
        .filter(User.company_id == site.company_id, UserSite.site_id == site.id)
        .order_by(User.email)
        .all()
    )


def set_site_login_password(db: Session, site_id: int, login_user_id: int, new_password: str, user_id: int) -> User:
    """Set a new password on one of this site's pinned portal logins.

    The login must already be pinned to this site. Checking that here — rather than
    trusting the id the screen sends — keeps the site editor from being able to reach any
    other account in the company, whatever it posts.
    """
    from app.services import user_service

    logins = {u.id for u in list_site_portal_logins(db, site_id, user_id)}
    if login_user_id not in logins:
        raise HTTPException(status_code=404, detail="Portal login not found for this site")
    company = get_company_by_user_id(db, user_id)
    return user_service.reset_company_user_password(db, company.id, login_user_id, new_password)


def _assert_not_archived(site: Site) -> None:
    if soft_delete.is_archived(site):
        raise HTTPException(
            status_code=409,
            detail=f"“{site.name}” is archived. Restore it before making changes.",
        )


def update_site(db: Session, site_id: int, site: SiteCreate, user_id: int) -> Site:
    _block_portal_roles(db, user_id)
    company = get_company_by_user_id(db, user_id)
    db_site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    _assert_not_archived(db_site)
    cid_attr = getattr(site, "client_id", None)
    if cid_attr and not db.query(Client).filter(Client.id == cid_attr, Client.company_id == company.id).first():
        raise HTTPException(status_code=400, detail="Client not found")
    raw = _site_payload(site)
    cid = raw.pop("contractor_id", None)
    main_id = raw.pop("main_contractor_id", None)
    sub_id = raw.pop("sub_contractor_id", None)
    if cid is not None:
        if main_id is not None or sub_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Use either directory contractor (contractor_id) or legacy main/sub fields, not both.",
            )
        contractor_scope.resolve_directory_contractor_link(db, company.id, cid)
        db_site.contractor_id = cid
        db_site.main_contractor_id = None
        db_site.sub_contractor_id = None
    else:
        next_main, next_sub = contractor_scope.apply_site_contractors(db, company.id, main_id, sub_id)
        db_site.contractor_id = None
        db_site.main_contractor_id = next_main
        db_site.sub_contractor_id = next_sub
    old_name = db_site.name or ""
    new_name = " ".join(str(raw.get("name") or old_name).split())
    renamed = _norm_name(new_name) != _norm_name(old_name)
    if "name" in raw:
        raw["name"] = new_name
    if renamed:
        _assert_name_free(db, company.id, new_name, exclude_site_id=db_site.id)
    for key, value in raw.items():
        setattr(db_site, key, value)
    plans_updated = 0
    if renamed or new_name != old_name:
        plans_updated = _rename_site_in_rota_plans(db, company.id, db_site.id, old_name, new_name)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="update",
        entity_type="site",
        entity_id=site_id,
        meta={"renamed_from": old_name, "renamed_to": new_name, "rota_plans_updated": plans_updated}
        if new_name != old_name
        else None,
    )
    db.commit()
    db.refresh(db_site)
    return db_site


def _norm_name(name: Any) -> str:
    """How rota publishing matches a shift's site text to a site: trimmed, single-spaced,
    case-insensitive. Every name comparison here must use the same rule."""
    return " ".join(str(name or "").split()).lower()


def _assert_name_free(db: Session, company_id: int, name: str, exclude_site_id: int | None = None) -> None:
    """Refuse a name another site already has.

    Rotas refer to sites by name, so two sites that differ only in case or spacing are
    indistinguishable to them — a shift could land on either one.
    """
    key = _norm_name(name)
    if not key:
        return
    q = db.query(Site.id, Site.name).filter(Site.company_id == company_id)
    if exclude_site_id is not None:
        q = q.filter(Site.id != exclude_site_id)
    for _sid, other in q.all():
        if _norm_name(other) == key:
            raise HTTPException(
                status_code=409,
                detail=f"Another site is already called “{other}”. Choose a different name.",
            )


def _iter_planner_shifts(data: dict):
    """Yield (emp_id, day_key, index, shift) for every shift in a planner tree."""
    for emp_id, by_d in (data.get("shifts") or {}).items():
        if not isinstance(by_d, dict):
            continue
        for dk, day_shifts in by_d.items():
            if not isinstance(day_shifts, list):
                continue
            for idx, sh in enumerate(day_shifts):
                if isinstance(sh, dict):
                    yield emp_id, dk, idx, sh


def _company_rota_plans(db: Session, company_id: int):
    from app.models import RotaPlan

    # Binned rotas too: restoring one must not bring the old site name back with it.
    return (
        db.query(RotaPlan)
        .execution_options(include_deleted=True)
        .filter(RotaPlan.company_id == company_id, RotaPlan.planner_data.isnot(None))
        .all()
    )


def _name_shared_with_other_site(db: Session, company_id: int, site_id: int, name: str) -> bool:
    key = _norm_name(name)
    return any(
        _norm_name(n) == key
        for (n,) in db.query(Site.name).filter(Site.company_id == company_id, Site.id != site_id).all()
    )


def _rename_site_in_rota_plans(db: Session, company_id: int, site_id: int, old_name: str, new_name: str) -> int:
    """Carry a site rename into every rota that names it.

    A rota's shifts hold the site as text. Left alone, the rota keeps showing the old
    name, and the next save or publish finds no site by that name and creates a new one
    — the "renaming makes a second site" bug. Returns how many rotas changed.

    If another site still has the old name, the text is ambiguous and is left as it is.
    """
    import json

    old_key = _norm_name(old_name)
    if not old_key or not new_name:
        return 0
    if _name_shared_with_other_site(db, company_id, site_id, old_name):
        return 0
    changed = 0
    for plan in _company_rota_plans(db, company_id):
        try:
            data = json.loads(plan.planner_data or "")
        except (TypeError, ValueError):
            continue
        if not isinstance(data, dict):
            continue
        hit = False
        for _e, _d, _i, sh in _iter_planner_shifts(data):
            if _norm_name(sh.get("site")) == old_key:
                sh["site"] = new_name
                hit = True
        if hit:
            plan.planner_data = json.dumps(data)
            changed += 1
    return changed


def _remove_site_from_rota_plans(db: Session, company_id: int, site: Site) -> int:
    """Drop a permanently deleted site's shifts from every rota that names it.

    Otherwise the next save or publish of that rota would create the site again. The
    planner's attendance map is keyed by each shift's position in its day, so it is
    re-keyed to match the shifts that remain. Returns the number of shifts removed.
    """
    import json

    key = _norm_name(site.name)
    if not key or _name_shared_with_other_site(db, company_id, site.id, site.name):
        return 0
    removed = 0
    for plan in _company_rota_plans(db, company_id):
        try:
            data = json.loads(plan.planner_data or "")
        except (TypeError, ValueError):
            continue
        if not isinstance(data, dict):
            continue
        shifts = data.get("shifts") or {}
        if not isinstance(shifts, dict):
            continue
        attendance = data.get("attendance") if isinstance(data.get("attendance"), dict) else {}
        new_att = dict(attendance)
        plan_removed = 0
        for emp_id, by_d in shifts.items():
            if not isinstance(by_d, dict):
                continue
            for dk, day_shifts in list(by_d.items()):
                if not isinstance(day_shifts, list):
                    continue
                kept = []
                index_map: dict[int, int] = {}
                for idx, sh in enumerate(day_shifts):
                    if isinstance(sh, dict) and _norm_name(sh.get("site")) == key:
                        continue
                    index_map[idx] = len(kept)
                    kept.append(sh)
                if len(kept) == len(day_shifts):
                    continue
                plan_removed += len(day_shifts) - len(kept)
                for idx in range(len(day_shifts)):
                    new_att.pop(f"{emp_id}:{dk}:{idx}", None)
                for idx, new_idx in index_map.items():
                    rec = attendance.get(f"{emp_id}:{dk}:{idx}")
                    if rec is not None:
                        new_att[f"{emp_id}:{dk}:{new_idx}"] = rec
                if kept:
                    by_d[dk] = kept
                else:
                    del by_d[dk]
        if plan_removed:
            if "attendance" in data:
                data["attendance"] = new_att
            plan.planner_data = json.dumps(data)
            removed += plan_removed
    return removed


def _site_for_write(db: Session, site_id: int, user_id: int):
    _block_portal_roles(db, user_id)
    company = get_company_by_user_id(db, user_id)
    site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site, company


def delete_site(db: Session, site_id: int, user_id: int) -> None:
    """Permanently remove a site and everything that only exists because of it.

    Destroyed: its shifts (with their attendance), rota-plan shifts that name it, patrol
    routes / checkpoints / sessions / logs, site rates, staff requests, contractor
    bookings, lone-worker policies and login pins.

    Kept, with the site link cleared: invoices and credit notes (financial records),
    incidents, accident reports, tasks, occurrence sheets, lone-worker history and the
    shift audit trail. Their own text and snapshots still say what happened.

    Rota plans are cleaned as well — they name sites as text, and publishing a rota
    that still named this site used to quietly create it again.
    """
    site, company = _site_for_write(db, site_id, user_id)
    impact = _site_impact_counts(db, site)
    name = site.name
    rota_shifts = _remove_site_from_rota_plans(db, company.id, site)
    _purge_site_dependents(db, site.id)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="delete",
        entity_type="site",
        entity_id=site_id,
        meta={
            "name": name,
            "destroyed": [{"label": k, "count": v} for k, v in impact.items() if v],
            "rota_plan_shifts_removed": rota_shifts,
        },
    )
    db.query(Site).filter(Site.id == site.id).delete(synchronize_session=False)
    db.commit()


def _ids(db: Session, column, *criteria) -> list:
    """Ids matching ``criteria``, archived / binned rows included — they still hold FKs."""
    return [
        r[0]
        for r in db.query(column).execution_options(include_deleted=True).filter(*criteria).all()
    ]


def _purge_site_dependents(db: Session, site_id: int) -> None:
    """Delete or detach every row that points at the site, children first.

    Postgres enforces every one of these foreign keys (all ON DELETE NO ACTION), so the
    order matters. Bulk statements skip the ORM soft-delete filter, so binned rows are
    covered too.
    """
    from sqlalchemy import or_

    from app.models import (
        AccidentReport,
        Assignment,
        Attendance,
        ContractorAssignment,
        CreditNote,
        Incident,
        InvoiceLine,
        LoneWorkerEscalationContact,
        LoneWorkerEvent,
        LoneWorkerIncident,
        LoneWorkerPolicy,
        LoneWorkerSession,
        OccurrenceSheet,
        PatrolAlert,
        PatrolCheckpoint,
        PatrolLog,
        PatrolOccurrence,
        PatrolRoute,
        PatrolSession,
        RecurringInvoice,
        ShiftAuditLog,
        ShiftEarlyFinishLog,
        ShiftLateLog,
        ShiftOvertimeLog,
        SiteRate,
        StaffRequest,
        Task,
        UserSite,
    )
    from app.services import shift_audit_service

    def _delete(model, *criteria):
        db.query(model).filter(*criteria).delete(synchronize_session=False)

    def _detach(model, column="site_id"):
        col = getattr(model, column)
        db.query(model).filter(col == site_id).update({col: None}, synchronize_session=False)

    # Shifts: attendance goes with them; history rows keep their snapshot, lose the link.
    shift_ids = _ids(db, Assignment.id, Assignment.site_id == site_id)
    if shift_ids:
        _delete(Attendance, Attendance.assignment_id.in_(shift_ids))
        shift_audit_service.detach_assignments(db, shift_ids)
        _delete(Assignment, Assignment.id.in_(shift_ids))

    # Patrols: routes → checkpoints / sessions → occurrences → logs / alerts.
    route_ids = _ids(db, PatrolRoute.id, PatrolRoute.site_id == site_id)
    cp_ids = _ids(
        db,
        PatrolCheckpoint.id,
        or_(PatrolCheckpoint.site_id == site_id, PatrolCheckpoint.route_id.in_(route_ids or [0])),
    )
    session_ids = _ids(db, PatrolSession.id, PatrolSession.route_id.in_(route_ids or [0]))
    occ_ids = _ids(
        db,
        PatrolOccurrence.id,
        or_(
            PatrolOccurrence.site_id == site_id,
            PatrolOccurrence.route_id.in_(route_ids or [0]),
            PatrolOccurrence.checkpoint_id.in_(cp_ids or [0]),
            PatrolOccurrence.session_id.in_(session_ids or [0]),
        ),
    )
    log_ids = _ids(
        db,
        PatrolLog.id,
        or_(
            PatrolLog.route_id.in_(route_ids or [0]),
            PatrolLog.checkpoint_id.in_(cp_ids or [0]),
            PatrolLog.session_id.in_(session_ids or [0]),
            PatrolLog.occurrence_id.in_(occ_ids or [0]),
        ),
    )
    if route_ids or cp_ids or session_ids or occ_ids:
        _delete(
            PatrolAlert,
            or_(
                PatrolAlert.route_id.in_(route_ids or [0]),
                PatrolAlert.checkpoint_id.in_(cp_ids or [0]),
                PatrolAlert.session_id.in_(session_ids or [0]),
                PatrolAlert.occurrence_id.in_(occ_ids or [0]),
            ),
        )
    if log_ids:
        # Another site's occurrence should never point at these logs, but if one does it
        # keeps its row and only loses the link.
        db.query(PatrolOccurrence).filter(PatrolOccurrence.log_id.in_(log_ids)).update(
            {PatrolOccurrence.log_id: None}, synchronize_session=False
        )
    if occ_ids:
        _delete(PatrolOccurrence, PatrolOccurrence.id.in_(occ_ids))
    if log_ids:
        _delete(PatrolLog, PatrolLog.id.in_(log_ids))
    if session_ids:
        _delete(PatrolSession, PatrolSession.id.in_(session_ids))
    if cp_ids:
        _delete(PatrolCheckpoint, PatrolCheckpoint.id.in_(cp_ids))
    if route_ids:
        _delete(PatrolRoute, PatrolRoute.id.in_(route_ids))

    # Lone-worker policies for this site go; the sessions run under them stay as history.
    policy_ids = _ids(db, LoneWorkerPolicy.id, LoneWorkerPolicy.site_id == site_id)
    if policy_ids:
        _delete(LoneWorkerEscalationContact, LoneWorkerEscalationContact.policy_id.in_(policy_ids))
        db.query(LoneWorkerSession).filter(LoneWorkerSession.policy_id.in_(policy_ids)).update(
            {LoneWorkerSession.policy_id: None}, synchronize_session=False
        )
        _delete(LoneWorkerPolicy, LoneWorkerPolicy.id.in_(policy_ids))

    # Records that only make sense for this site.
    _delete(UserSite, UserSite.site_id == site_id)
    _delete(SiteRate, SiteRate.site_id == site_id)
    _delete(StaffRequest, StaffRequest.site_id == site_id)
    _delete(ContractorAssignment, ContractorAssignment.site_id == site_id)

    # A recurring invoice for a site that no longer exists must stop raising invoices.
    db.query(RecurringInvoice).filter(
        RecurringInvoice.site_id == site_id, RecurringInvoice.status == "active"
    ).update({RecurringInvoice.status: "ended"}, synchronize_session=False)

    # History and financial records stay; only their pointer to the site is cleared.
    for model in (
        InvoiceLine,
        CreditNote,
        RecurringInvoice,
        Incident,
        AccidentReport,
        Task,
        OccurrenceSheet,
        ShiftAuditLog,
        ShiftLateLog,
        ShiftOvertimeLog,
        ShiftEarlyFinishLog,
        LoneWorkerSession,
        LoneWorkerIncident,
        LoneWorkerEvent,
    ):
        _detach(model)


def archive_site(db: Session, site_id: int, user_id: int) -> Site:
    """Soft delete: the site leaves every list and picker, its history stays.

    Unlike a permanent delete this is *not* blocked by existing shifts or patrol records
    — leaving them readable is the point. It is the right answer for a site that has gone
    but whose rota you still need to bill and pay from.
    """
    site, company = _site_for_write(db, site_id, user_id)
    if soft_delete.is_archived(site):
        return site
    soft_delete.mark_archived(site, user_id)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="archive",
        entity_type="site",
        entity_id=site_id,
        meta={"name": site.name},
    )
    db.commit()
    db.refresh(site)
    return site


def restore_site(db: Session, site_id: int, user_id: int) -> Site:
    """Bring an archived site back into the lists."""
    site, company = _site_for_write(db, site_id, user_id)
    if not soft_delete.is_archived(site):
        return site
    soft_delete.mark_restored(site)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="restore",
        entity_type="site",
        entity_id=site_id,
        meta={"name": site.name},
    )
    db.commit()
    db.refresh(site)
    return site


def _site_impact_counts(db: Session, site: Site) -> dict:
    """What a permanent delete destroys, by label. Archived / binned rows count too."""
    from app.models import (
        Assignment,
        ContractorAssignment,
        LoneWorkerPolicy,
        PatrolCheckpoint,
        PatrolRoute,
        SiteRate,
        StaffRequest,
        UserSite,
    )

    def _n(column, *criteria) -> int:
        return len(_ids(db, column, *criteria))

    return {
        "shifts": _n(Assignment.id, Assignment.site_id == site.id),
        "contractor bookings": _n(ContractorAssignment.id, ContractorAssignment.site_id == site.id),
        "patrol routes": _n(PatrolRoute.id, PatrolRoute.site_id == site.id),
        "patrol checkpoints": _n(PatrolCheckpoint.id, PatrolCheckpoint.site_id == site.id),
        "site rates": _n(SiteRate.id, SiteRate.site_id == site.id),
        "staff requests": _n(StaffRequest.id, StaffRequest.site_id == site.id),
        "lone-worker policies": _n(LoneWorkerPolicy.id, LoneWorkerPolicy.site_id == site.id),
        "login site pins": _n(UserSite.id, UserSite.site_id == site.id),
    }


def _rota_plan_shift_count(db: Session, company_id: int, site: Site) -> int:
    import json

    key = _norm_name(site.name)
    if not key or _name_shared_with_other_site(db, company_id, site.id, site.name):
        return 0
    n = 0
    for plan in _company_rota_plans(db, company_id):
        try:
            data = json.loads(plan.planner_data or "")
        except (TypeError, ValueError):
            continue
        if isinstance(data, dict):
            n += sum(1 for *_x, sh in _iter_planner_shifts(data) if _norm_name(sh.get("site")) == key)
    return n


def site_delete_impact(db: Session, site_id: int, user_id: int) -> dict:
    """What a permanent delete would take with it. Nothing blocks it any more."""
    from app.models import InvoiceLine

    site, company = _site_for_write(db, site_id, user_id)
    counts = _site_impact_counts(db, site)
    records = [{"label": k, "count": v} for k, v in counts.items() if v]
    rota = _rota_plan_shift_count(db, company.id, site)
    if rota:
        records.append({"label": "shifts in rota plans", "count": rota})
    invoiced = len(_ids(db, InvoiceLine.id, InvoiceLine.site_id == site.id))
    if invoiced:
        # Not destroyed: the invoices stay as issued, they just stop linking to the site.
        records.append({"label": "invoice lines kept but unlinked from the site", "count": invoiced})
    return {
        "id": site.id,
        "name": site.name,
        "archived": soft_delete.is_archived(site),
        "records": records,
        "blockers": [],
    }


def _instructions_hash(text: str | None) -> str:
    import hashlib

    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def instructions_acknowledged_for(db: Session, user: User, site: Site) -> bool:
    """True when this user has acknowledged the current instructions text."""
    from app.models import SiteInstructionAck

    text = (getattr(site, "assignment_instructions", None) or "").strip()
    if not text:
        return True
    digest = _instructions_hash(text)
    row = (
        db.query(SiteInstructionAck.id)
        .filter(
            SiteInstructionAck.site_id == site.id,
            SiteInstructionAck.user_id == user.id,
            SiteInstructionAck.instructions_hash == digest,
        )
        .first()
    )
    return row is not None


def attach_instruction_ack(db: Session, user: User, sites: List[Site]) -> List[Site]:
    """Stamp ``instructions_acknowledged`` onto site instances for SiteResponse."""
    for site in sites:
        try:
            site.instructions_acknowledged = instructions_acknowledged_for(db, user, site)
        except Exception:
            site.instructions_acknowledged = False
    return sites


def acknowledge_instructions(db: Session, site_id: int, user: User) -> Site:
    """Record that the current user has read the site assignment instructions."""
    from datetime import datetime, timezone

    from app.models import SiteInstructionAck

    site = get_site_by_id(db, site_id, user.id)
    text = (getattr(site, "assignment_instructions", None) or "").strip()
    if not text:
        site.instructions_acknowledged = True
        return site
    digest = _instructions_hash(text)
    existing = (
        db.query(SiteInstructionAck)
        .filter(
            SiteInstructionAck.site_id == site.id,
            SiteInstructionAck.user_id == user.id,
            SiteInstructionAck.instructions_hash == digest,
        )
        .first()
    )
    if existing is None:
        db.add(
            SiteInstructionAck(
                site_id=site.id,
                user_id=user.id,
                guard_id=getattr(user, "guard_id", None),
                instructions_hash=digest,
                acknowledged_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
    site.instructions_acknowledged = True
    return site
