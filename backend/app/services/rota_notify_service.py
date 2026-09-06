"""Notify staff when published rota shifts change (email, SMS, in-app)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Dict, Iterable, List, Optional, Set, Tuple

from sqlalchemy.orm import Session, joinedload

from app.models import AppNotification, Assignment, Guard, RotaPlan, User
from app.services import email_trigger_service, sms_trigger_service
from app.services.company_service import get_company_by_user_id


ShiftKey = Tuple[int, str, str, str, str, int]  # guard_id, date, start, end, site_lower, break_mins


@dataclass
class ShiftChange:
    guard_id: int
    kind: str  # added | removed | time_changed | site_changed | changed
    date: str
    detail: str


def _norm_site(name: Optional[str]) -> str:
    return (name or "").strip().lower()


def fingerprint_from_assignments(
    db: Session, plan_id: int, guard_id: Optional[int] = None
) -> Set[ShiftKey]:
    q = (
        db.query(Assignment)
        .options(joinedload(Assignment.site))
        .filter(Assignment.rota_plan_id == plan_id)
    )
    if guard_id is not None:
        q = q.filter(Assignment.guard_id == guard_id)
    out: Set[ShiftKey] = set()
    for a in q.all():
        site = a.site.name if a.site else ""
        out.add(
            (
                int(a.guard_id),
                a.date.isoformat() if isinstance(a.date, date) else str(a.date),
                (a.shift_start or "").strip(),
                (a.shift_end or "").strip(),
                _norm_site(site),
                int(a.break_minutes or 0),
            )
        )
    return out


def fingerprint_from_planner_shifts(
    shifts: Optional[dict], guard_id: Optional[int] = None
) -> Set[ShiftKey]:
    out: Set[ShiftKey] = set()
    for emp_id, by_d in (shifts or {}).items():
        try:
            gid = int(emp_id)
        except (TypeError, ValueError):
            continue
        if guard_id is not None and gid != guard_id:
            continue
        for dk, day_shifts in (by_d or {}).items():
            for sh in day_shifts or []:
                if not isinstance(sh, dict):
                    continue
                break_m = int(sh.get("breakM") or 0) + int(sh.get("breakH") or 0) * 60
                out.add(
                    (
                        gid,
                        str(dk)[:10],
                        str(sh.get("start") or "").strip(),
                        str(sh.get("end") or "").strip(),
                        _norm_site(sh.get("site")),
                        break_m,
                    )
                )
    return out


def diff_shift_fingerprints(before: Set[ShiftKey], after: Set[ShiftKey]) -> List[ShiftChange]:
    """Classify adds/removes and try to pair same-day changes (time/site)."""
    changes: List[ShiftChange] = []
    removed = before - after
    added = after - before

    rem_by: Dict[Tuple[int, str], List[ShiftKey]] = {}
    add_by: Dict[Tuple[int, str], List[ShiftKey]] = {}
    for k in removed:
        rem_by.setdefault((k[0], k[1]), []).append(k)
    for k in added:
        add_by.setdefault((k[0], k[1]), []).append(k)

    paired_rem: Set[ShiftKey] = set()
    paired_add: Set[ShiftKey] = set()

    for key in set(rem_by) | set(add_by):
        rlist = rem_by.get(key, [])
        alist = add_by.get(key, [])
        while rlist and alist:
            old = rlist.pop(0)
            new = alist.pop(0)
            paired_rem.add(old)
            paired_add.add(new)
            gid, dk = key
            if old[2] != new[2] or old[3] != new[3]:
                kind = "time_changed"
                detail = f"{dk}: {old[2]}–{old[3]} → {new[2]}–{new[3]}"
                if old[4] != new[4]:
                    detail += f" · site {old[4] or '—'} → {new[4] or '—'}"
                    kind = "changed"
            elif old[4] != new[4]:
                kind = "site_changed"
                detail = f"{dk} {new[2]}–{new[3]}: site {old[4] or '—'} → {new[4] or '—'}"
            else:
                kind = "changed"
                detail = f"{dk}: {new[2]}–{new[3]} at {new[4] or 'site'}"
            changes.append(ShiftChange(guard_id=gid, kind=kind, date=dk, detail=detail))

    for k in removed - paired_rem:
        changes.append(
            ShiftChange(
                guard_id=k[0],
                kind="removed",
                date=k[1],
                detail=f"{k[1]}: {k[2]}–{k[3]} at {k[4] or 'site'} cancelled",
            )
        )
    for k in added - paired_add:
        changes.append(
            ShiftChange(
                guard_id=k[0],
                kind="added",
                date=k[1],
                detail=f"{k[1]}: {k[2]}–{k[3]} at {k[4] or 'site'}",
            )
        )
    return changes


_KIND_TITLES = {
    "added": "New shift added",
    "removed": "Shift cancelled",
    "time_changed": "Shift time changed",
    "site_changed": "Shift location changed",
    "changed": "Shift updated",
}


def _guard_user_id(db: Session, company_id: int, guard_id: int) -> Optional[int]:
    u = (
        db.query(User)
        .filter(User.company_id == company_id, User.guard_id == guard_id)
        .first()
    )
    return u.id if u else None


def _send_channels(
    db: Session,
    actor_user_id: int,
    guard: Guard,
    subject: str,
    body: str,
    date_str: str,
    site: str,
    shift: str,
) -> None:
    """Email + SMS to the guard (reaches their phone)."""
    try:
        email_trigger_service._safe_send(
            db,
            actor_user_id,
            email_trigger_service._guard_email(guard),
            subject,
            "rota_change",
            date=date_str,
            site=site or "site",
            shift=shift or body,
            message=body,
        )
    except Exception:
        pass
    try:
        sms_trigger_service._safe_send(
            db,
            actor_user_id,
            sms_trigger_service._guard_phone(guard),
            "rota_change",
            date=date_str,
            site=site or "site",
            shift=shift or body,
            message=body,
        )
    except Exception:
        pass


def notify_shift_changes(
    db: Session,
    actor_user_id: int,
    plan: RotaPlan,
    changes: Iterable[ShiftChange],
) -> None:
    company = get_company_by_user_id(db, actor_user_id)
    by_guard: Dict[int, List[ShiftChange]] = {}
    for c in changes:
        by_guard.setdefault(c.guard_id, []).append(c)

    if not by_guard:
        return

    guards = {
        g.id: g
        for g in db.query(Guard)
        .filter(
            Guard.company_id == company.id,
            Guard.deleted_at.is_(None),
            Guard.id.in_(list(by_guard.keys())),
        )
        .all()
    }

    for gid, items in by_guard.items():
        guard = guards.get(gid)
        if not guard:
            continue
        # Summarise for this staff member
        lines = []
        for c in items[:8]:
            title = _KIND_TITLES.get(c.kind, "Rota updated")
            lines.append(f"{title}: {c.detail}")
        if len(items) > 8:
            lines.append(f"…and {len(items) - 8} more change(s)")
        body = "\n".join(lines)
        title = f"Rota update — {plan.name}"
        if len(items) == 1:
            title = f"{_KIND_TITLES.get(items[0].kind, 'Rota updated')} — {plan.name}"

        # In-app notification for linked portal user
        uid = _guard_user_id(db, company.id, gid)
        if uid:
            db.add(
                AppNotification(
                    company_id=company.id,
                    user_id=uid,
                    kind="rota_change",
                    title=title,
                    body=body[:500],
                    entity_type="rota",
                    entity_id=plan.id,
                )
            )

        # Mobile-reaching channels
        first = items[0]
        site_guess = ""
        shift_guess = first.detail
        _send_channels(
            db,
            actor_user_id,
            guard,
            title,
            body,
            first.date,
            site_guess,
            shift_guess,
        )

    try:
        db.commit()
    except Exception:
        db.rollback()
