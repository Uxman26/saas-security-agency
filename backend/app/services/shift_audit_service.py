"""Shift history: who changed which shift, what changed, and exactly when.

Every shift mutation funnels through here, whether it arrived from the web planner, a
direct assignment call from the mobile app, or a background sync. The rows are written
append-only and read back by the Shift History report.

Why the planner is diffed rather than instrumented per action
------------------------------------------------------------
The web planner does not send "add shift" / "move shift" commands. It PATCHes the whole
``planner_data`` JSON tree for the rota, so the only way to know what a user actually did
is to compare the stored tree with the incoming one. :func:`diff_planner` pairs the two
sides in decreasing order of confidence — same shift, same slot, moved between staff,
moved between days — and whatever is left over is a genuine create or delete. That
pairing is what separates a reassignment from a delete-plus-create, which matters because
those read very differently in an audit.

Publishing is logged separately: it deletes and rewrites the assignment rows for a rota,
so assignment ids churn on every publish and cannot themselves carry the history.
"""

from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session, joinedload

from app.models import Assignment, Guard, RotaPlan, ShiftAuditLog, Site, User
from app.middleware.client_source import get_client_source

# --- Actions -------------------------------------------------------------------------
# Stored verbatim in the `action` column; the labels are what the report shows.
ACTION_LABELS: dict[str, str] = {
    "shift_created": "Shift created",
    "shift_added_to_rota": "Shift added to rota",
    "shift_assigned": "Shift assigned to staff",
    "shift_reassigned": "Shift reassigned to another staff member",
    "shift_time_changed": "Shift timing changed",
    "shift_date_changed": "Shift date changed",
    "shift_rota_changed": "Rota changed",
    "shift_updated": "Shift updated",
    "shift_deleted": "Shift deleted",
    "shift_published": "Shift published to staff",
    "shift_unpublished": "Shift unpublished",
}

FIELD_LABELS: list[tuple[str, str]] = [
    ("guard_name", "Staff"),
    ("date", "Date"),
    ("start", "Start time"),
    ("end", "End time"),
    ("break_minutes", "Break (mins)"),
    ("site", "Site"),
    ("rate", "Shift rate"),
    ("shift_type", "Shift type"),
    ("notes", "Notes"),
]


def action_label(action: str) -> str:
    return ACTION_LABELS.get(action, (action or "").replace("_", " ").capitalize())


# --- Shift snapshots -----------------------------------------------------------------


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _num(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        return round(float(value), 4)
    except (TypeError, ValueError):
        return None


def shift_snapshot(
    guard_id: int,
    guard_name: str,
    date_key: str,
    block: dict,
) -> dict:
    """Flatten one planner shift block into the shape stored on the audit row."""
    break_minutes = int(block.get("breakM") or 0) + int(block.get("breakH") or 0) * 60
    return {
        "guard_id": int(guard_id),
        "guard_name": guard_name,
        "date": str(date_key)[:10],
        "start": _clean(block.get("start")),
        "end": _clean(block.get("end")),
        "break_minutes": break_minutes,
        "site": _clean(block.get("site")),
        "rate": _num(block.get("shiftRate")),
        "shift_type": _clean(block.get("shiftType")),
        "notes": _clean(block.get("notes")) or _clean(block.get("label")),
    }


def snapshot_from_assignment(a: Assignment) -> dict:
    return {
        "guard_id": int(a.guard_id) if a.guard_id else None,
        "guard_name": a.guard.full_name if a.guard else "",
        "date": a.date.isoformat() if isinstance(a.date, date) else _clean(a.date),
        "start": _clean(a.shift_start),
        "end": _clean(a.shift_end),
        "break_minutes": int(a.break_minutes or 0),
        "site": a.site.name if a.site else "",
        "rate": _num(a.shift_rate),
        "shift_type": _clean(a.shift_type),
        "notes": "",
    }


def diff_fields(before: Optional[dict], after: Optional[dict]) -> list[dict]:
    """Field-level before/after pairs, in a stable display order."""
    if not before or not after:
        return []
    out: list[dict] = []
    for key, label in FIELD_LABELS:
        old = before.get(key)
        new = after.get(key)
        if old == new:
            continue
        out.append({"field": key, "label": label, "from": old, "to": new})
    return out


def _fmt_value(value: Any) -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def format_changes(changes: Iterable[dict]) -> str:
    return "; ".join(f"{c.get('label') or c.get('field')}: {_fmt_value(c.get('from'))} → {_fmt_value(c.get('to'))}" for c in changes)


def _summary_for(action: str, before: Optional[dict], after: Optional[dict], changes: list[dict]) -> str:
    shift = after or before or {}
    when = f"{shift.get('date') or ''} {shift.get('start') or ''}–{shift.get('end') or ''}".strip()
    base = f"{action_label(action)} · {when}".strip(" ·")
    if changes:
        return f"{base} · {format_changes(changes)}"
    return base


# --- Writing -------------------------------------------------------------------------


def make_shift_ref(
    rota_plan_id: Optional[int], guard_id: Optional[int], shift_date: Optional[str], slot: int = 0
) -> str:
    """Stable reference for a shift across edits and republishes."""
    return f"R{rota_plan_id or 0}-G{guard_id or 0}-{(shift_date or '')[:10]}-{slot}"


def _actor(db: Session, user_id: Optional[int]) -> tuple[Optional[User], str, str, str]:
    if not user_id:
        return None, "System", "", ""
    user = db.query(User).options(joinedload(User.role_row)).filter(User.id == user_id).first()
    if not user:
        return None, "System", "", ""
    # `role` is the legacy string column; `role_row` is the assigned RBAC role, which is
    # the more meaningful label when the company has custom roles.
    role_row = getattr(user, "role_row", None)
    role = (getattr(role_row, "name", "") or getattr(role_row, "slug", "") or user.role or "") if role_row else (user.role or "")
    return user, (user.full_name or user.email or "User"), (user.email or ""), role


def record(
    db: Session,
    *,
    company_id: int,
    user_id: Optional[int],
    action: str,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    rota_plan: Optional[RotaPlan] = None,
    rota_plan_id: Optional[int] = None,
    rota_name: Optional[str] = None,
    assignment_id: Optional[int] = None,
    site_id: Optional[int] = None,
    guard_id: Optional[int] = None,
    slot: int = 0,
    source: Optional[str] = None,
    summary: Optional[str] = None,
) -> ShiftAuditLog:
    """Add one history row. Caller commits — audit writes join the transaction they describe."""
    shift = after or before or {}
    changes = diff_fields(before, after)
    plan_id = rota_plan.id if rota_plan is not None else rota_plan_id
    name = rota_name if rota_name is not None else (rota_plan.name if rota_plan is not None else None)
    gid = guard_id if guard_id is not None else shift.get("guard_id")
    shift_date = shift.get("date") or None
    parsed_date: Optional[date] = None
    if shift_date:
        try:
            parsed_date = date.fromisoformat(str(shift_date)[:10])
        except ValueError:
            parsed_date = None
    _, user_name, user_email, user_role = _actor(db, user_id)
    row = ShiftAuditLog(
        company_id=company_id,
        action=action,
        shift_ref=make_shift_ref(plan_id, gid, shift_date, slot),
        assignment_id=assignment_id,
        rota_plan_id=plan_id,
        rota_name=name,
        guard_id=gid,
        guard_name=shift.get("guard_name") or "",
        site_id=site_id,
        site_name=shift.get("site") or "",
        shift_date=parsed_date,
        summary=summary or _summary_for(action, before, after, changes),
        changes=json.dumps(changes) if changes else None,
        before_json=json.dumps(before) if before else None,
        after_json=json.dumps(after) if after else None,
        source=source or get_client_source(),
        user_id=user_id,
        user_name=user_name,
        user_email=user_email,
        user_role=user_role,
    )
    db.add(row)
    return row


# --- Planner diffing -----------------------------------------------------------------


def _planner_shifts(planner: Optional[dict]) -> list[dict]:
    """Every shift in a planner tree, flattened, with its slot index kept."""
    if not isinstance(planner, dict):
        return []
    names: dict[int, str] = {}
    for emp in planner.get("employees") or []:
        if not isinstance(emp, dict):
            continue
        try:
            names[int(emp.get("id"))] = _clean(emp.get("name"))
        except (TypeError, ValueError):
            continue
    out: list[dict] = []
    for emp_id, by_day in (planner.get("shifts") or {}).items():
        try:
            gid = int(emp_id)
        except (TypeError, ValueError):
            continue
        for dk, blocks in (by_day or {}).items():
            for slot, block in enumerate(blocks or []):
                if not isinstance(block, dict):
                    continue
                snap = shift_snapshot(gid, names.get(gid, ""), dk, block)
                snap["slot"] = slot
                out.append(snap)
    return out


def _identity(s: dict) -> tuple:
    return (s["guard_id"], s["date"], s["start"], s["end"], s["site"].lower(), s["break_minutes"])


def _pair_by(
    olds: list[dict], news: list[dict], key
) -> list[tuple[dict, dict]]:
    """Greedily pair leftover old/new shifts that agree on `key`."""
    buckets: dict[tuple, list[dict]] = {}
    for o in olds:
        buckets.setdefault(key(o), []).append(o)
    pairs: list[tuple[dict, dict]] = []
    taken_new: list[dict] = []
    for n in news:
        bucket = buckets.get(key(n))
        if bucket:
            pairs.append((bucket.pop(0), n))
            taken_new.append(n)
    paired_old = {id(o) for o, _ in pairs}
    paired_new = {id(n) for n in taken_new}
    olds[:] = [o for o in olds if id(o) not in paired_old]
    news[:] = [n for n in news if id(n) not in paired_new]
    return pairs


def _classify(before: dict, after: dict) -> str:
    if before["guard_id"] != after["guard_id"]:
        return "shift_reassigned"
    if before["date"] != after["date"]:
        return "shift_date_changed"
    if before["start"] != after["start"] or before["end"] != after["end"]:
        return "shift_time_changed"
    return "shift_updated"


def diff_planner(old_planner: Optional[dict], new_planner: Optional[dict]) -> list[dict]:
    """Compare two planner trees and return one event per shift that actually changed.

    Events are ``{"action", "before", "after"}``; `before` is None for a creation and
    `after` is None for a deletion.
    """
    olds = _planner_shifts(old_planner)
    news = _planner_shifts(new_planner)

    # 1. Identical shifts — drop them, they are not events.
    _pair_by(olds, news, _identity)

    events: list[dict] = []

    # 2. Same staff, same day, same slot — an in-place edit (time, site, rate, notes…).
    for before, after in _pair_by(olds, news, lambda s: (s["guard_id"], s["date"], s["slot"])):
        events.append({"action": _classify(before, after), "before": before, "after": after})

    # 3. Same staff and day, different slot — still the same day's shift being edited.
    for before, after in _pair_by(olds, news, lambda s: (s["guard_id"], s["date"])):
        events.append({"action": _classify(before, after), "before": before, "after": after})

    # 4. Same shift on the same day under a different staff member — a reassignment.
    for before, after in _pair_by(
        olds, news, lambda s: (s["date"], s["start"], s["end"], s["site"].lower())
    ):
        events.append({"action": "shift_reassigned", "before": before, "after": after})

    # 5. Same staff and same shift, different day — the shift was moved.
    for before, after in _pair_by(
        olds, news, lambda s: (s["guard_id"], s["start"], s["end"], s["site"].lower())
    ):
        events.append({"action": "shift_date_changed", "before": before, "after": after})

    # 6. Whatever is left really was created or deleted.
    for after in news:
        events.append({"action": "shift_created", "before": None, "after": after})
    for before in olds:
        events.append({"action": "shift_deleted", "before": before, "after": None})

    events.sort(key=lambda e: ((e["after"] or e["before"]).get("date") or "", (e["after"] or e["before"]).get("start") or ""))
    return events


def _parse(raw: Optional[str]) -> Optional[dict]:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    return data if isinstance(data, dict) else None


def _site_ids_by_name(db: Session, company_id: int) -> dict[str, int]:
    rows = db.query(Site.id, Site.name).filter(Site.company_id == company_id).all()
    return {(r[1] or "").strip().lower(): r[0] for r in rows}


def _fill_guard_names(db: Session, company_id: int, events: list[dict]) -> None:
    """Planner trees can omit an employee's name; fall back to the guard record."""
    missing = {
        (e[side] or {}).get("guard_id")
        for e in events
        for side in ("before", "after")
        if e.get(side) and not (e[side] or {}).get("guard_name")
    }
    missing.discard(None)
    if not missing:
        return
    names = {
        r[0]: r[1]
        for r in db.query(Guard.id, Guard.full_name)
        .filter(Guard.company_id == company_id, Guard.id.in_(missing))
        .all()
    }
    for event in events:
        for side in ("before", "after"):
            snap = event.get(side)
            if snap and not snap.get("guard_name"):
                snap["guard_name"] = names.get(snap.get("guard_id"), "")


def log_planner_change(
    db: Session,
    *,
    company_id: int,
    user_id: Optional[int],
    plan: RotaPlan,
    old_planner_json: Optional[str],
    new_planner_json: Optional[str],
    created_action: str = "shift_created",
    source: Optional[str] = None,
) -> list[ShiftAuditLog]:
    """Diff a rota's planner data before/after an edit and log what changed."""
    events = diff_planner(_parse(old_planner_json), _parse(new_planner_json))
    if not events:
        return []
    _fill_guard_names(db, company_id, events)
    site_ids = _site_ids_by_name(db, company_id)
    rows: list[ShiftAuditLog] = []
    for event in events:
        shift = event["after"] or event["before"] or {}
        action = event["action"]
        if action == "shift_created":
            action = created_action
        rows.append(
            record(
                db,
                company_id=company_id,
                user_id=user_id,
                action=action,
                before=event["before"],
                after=event["after"],
                rota_plan=plan,
                site_id=site_ids.get((shift.get("site") or "").strip().lower()),
                slot=int(shift.get("slot") or 0),
                source=source,
            )
        )
    return rows


def log_plan_shifts(
    db: Session,
    *,
    company_id: int,
    user_id: Optional[int],
    plan: RotaPlan,
    planner_json: Optional[str],
    action: str,
    source: Optional[str] = None,
) -> list[ShiftAuditLog]:
    """Log every shift in a planner tree under one action (rota created, copied, deleted)."""
    planner = _parse(planner_json)
    shifts = _planner_shifts(planner)
    if not shifts:
        return []
    deleting = action == "shift_deleted"
    events = [
        {"action": action, "before": s if deleting else None, "after": None if deleting else s}
        for s in shifts
    ]
    _fill_guard_names(db, company_id, events)
    site_ids = _site_ids_by_name(db, company_id)
    rows: list[ShiftAuditLog] = []
    for event in events:
        shift = event["after"] or event["before"] or {}
        rows.append(
            record(
                db,
                company_id=company_id,
                user_id=user_id,
                action=action,
                before=event["before"],
                after=event["after"],
                rota_plan=plan,
                site_id=site_ids.get((shift.get("site") or "").strip().lower()),
                slot=int(shift.get("slot") or 0),
                source=source,
            )
        )
    return rows


def log_assignment_event(
    db: Session,
    *,
    company_id: int,
    user_id: Optional[int],
    action: str,
    assignment: Assignment,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    source: Optional[str] = None,
) -> ShiftAuditLog:
    """Log a change made straight against an assignment row (mobile app, API clients)."""
    snapshot = after if after is not None else (None if action == "shift_deleted" else snapshot_from_assignment(assignment))
    return record(
        db,
        company_id=company_id,
        user_id=user_id,
        action=action,
        before=before,
        after=snapshot,
        rota_plan_id=assignment.rota_plan_id,
        rota_name=assignment.rota_plan.name if assignment.rota_plan else None,
        assignment_id=assignment.id,
        guard_id=assignment.guard_id,
        site_id=assignment.site_id,
        source=source,
    )


def log_publish_changes(
    db: Session,
    *,
    company_id: int,
    user_id: Optional[int],
    plan: RotaPlan,
    changes: list,
    published: bool = True,
    source: Optional[str] = None,
) -> list[ShiftAuditLog]:
    """Log the shift-level result of publishing or unpublishing a rota.

    Publishing rewrites the rota's assignment rows wholesale, so the events come from
    the same fingerprint diff the staff notifications use rather than from row ids.
    """
    if not changes:
        return []
    names = {
        r[0]: r[1]
        for r in db.query(Guard.id, Guard.full_name).filter(Guard.company_id == company_id).all()
    }
    action = "shift_published" if published else "shift_unpublished"
    rows: list[ShiftAuditLog] = []
    for change in changes:
        gid = int(getattr(change, "guard_id", 0) or 0)
        dk = str(getattr(change, "date", "") or "")[:10]
        detail = str(getattr(change, "detail", "") or "")
        kind = str(getattr(change, "kind", "") or "")
        snap = {
            "guard_id": gid,
            "guard_name": names.get(gid, ""),
            "date": dk,
            "start": "",
            "end": "",
            "break_minutes": 0,
            "site": "",
            "rate": None,
            "shift_type": "",
            "notes": "",
        }
        rows.append(
            record(
                db,
                company_id=company_id,
                user_id=user_id,
                action=action,
                after=snap if published else None,
                before=None if published else snap,
                rota_plan=plan,
                guard_id=gid,
                source=source,
                summary=f"{action_label(action)} · {kind.replace('_', ' ')} · {detail}".strip(" ·"),
            )
        )
    return rows


# --- Reading -------------------------------------------------------------------------


def _day_bounds(start_date: date, end_date: date) -> tuple[datetime, datetime]:
    """Inclusive day range → half-open datetime range, so the last day is fully covered."""
    return datetime.combine(start_date, time.min), datetime.combine(end_date + timedelta(days=1), time.min)


def _row_dict(row: ShiftAuditLog) -> dict:
    changes = []
    if row.changes:
        try:
            changes = json.loads(row.changes)
        except json.JSONDecodeError:
            changes = []
    created = row.created_at
    return {
        "id": row.id,
        "shift_ref": row.shift_ref or "",
        "assignment_id": row.assignment_id,
        "rota_plan_id": row.rota_plan_id,
        "rota_name": row.rota_name or "",
        "site_id": row.site_id,
        "site": row.site_name or "",
        "guard_id": row.guard_id,
        "guard": row.guard_name or "",
        "shift_date": row.shift_date.isoformat() if row.shift_date else "",
        "action": row.action,
        "action_label": action_label(row.action),
        "summary": row.summary or "",
        "changes": changes,
        "previous_values": "; ".join(f"{c.get('label')}: {_fmt_value(c.get('from'))}" for c in changes),
        "new_values": "; ".join(f"{c.get('label')}: {_fmt_value(c.get('to'))}" for c in changes),
        "source": row.source or "",
        "user_id": row.user_id,
        "user": row.user_name or "",
        "user_email": row.user_email or "",
        "user_role": row.user_role or "",
        "action_date": created.date().isoformat() if created else "",
        "action_time": created.strftime("%H:%M:%S") if created else "",
        "created_at": created.isoformat() if created else "",
    }


def shift_history_rows(
    db: Session,
    user_id: int,
    start_date: date,
    end_date: date,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    rota_plan_id: Optional[int] = None,
    action: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    source: Optional[str] = None,
    limit: int = 1000,
) -> list[dict]:
    """Shift history for the caller's company, filtered by when the action happened.

    Tenant isolation is by ``company_id``; site access is narrowed further for logins
    that are pinned to specific sites, so a site-scoped user only sees history for the
    sites they can already see.
    """
    from app.services.company_service import get_company_by_user_id
    from app.services.portal_access import pinned_site_ids

    company = get_company_by_user_id(db, user_id)
    if end_date < start_date:
        start_date, end_date = end_date, start_date
    lower, upper = _day_bounds(start_date, end_date)

    q = db.query(ShiftAuditLog).filter(
        ShiftAuditLog.company_id == company.id,
        ShiftAuditLog.created_at >= lower,
        ShiftAuditLog.created_at < upper,
    )

    user = db.query(User).filter(User.id == user_id).first()
    allowed_sites = pinned_site_ids(db, user) if user else None
    if allowed_sites is not None:
        # Rows with no resolved site (a shift whose site was typed but never created)
        # stay hidden from a site-scoped login rather than leaking by default.
        q = q.filter(ShiftAuditLog.site_id.in_(allowed_sites or {0}))

    if guard_id:
        q = q.filter(ShiftAuditLog.guard_id == guard_id)
    if site_id:
        q = q.filter(ShiftAuditLog.site_id == site_id)
    if rota_plan_id:
        q = q.filter(ShiftAuditLog.rota_plan_id == rota_plan_id)
    if action:
        q = q.filter(ShiftAuditLog.action == action)
    if actor_user_id:
        q = q.filter(ShiftAuditLog.user_id == actor_user_id)
    if source:
        q = q.filter(ShiftAuditLog.source == source)

    rows = q.order_by(ShiftAuditLog.created_at.desc(), ShiftAuditLog.id.desc()).limit(max(1, min(limit, 5000))).all()
    return [_row_dict(r) for r in rows]
