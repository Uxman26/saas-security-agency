from __future__ import annotations

import hashlib
import hmac
import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Assignment, Guard, Site, User
from app.schemas import AssignmentCreate
from app.services import assignment_service, audit_service
from app.services.company_service import get_company_by_user_id
from app.services.portal_access import is_portal_role

_WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def _sign(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str)
    sig = hmac.new(
        (settings.secret_key or "controlops").encode(),
        raw.encode(),
        hashlib.sha256,
    ).hexdigest()
    return sig


def _time_to_minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def intervals_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    """Same overnight-aware rule as the rota UI (touching edges count as overlap)."""
    as_, ae = _time_to_minutes(a_start), _time_to_minutes(a_end)
    bs, be = _time_to_minutes(b_start), _time_to_minutes(b_end)
    if ae <= as_:
        ae += 24 * 60
    if be <= bs:
        be += 24 * 60
    return not (ae <= bs or be <= as_)


def resolve_next_weekday(name: str, *, today: Optional[date] = None) -> date:
    today = today or date.today()
    target = _WEEKDAYS[name.lower()]
    delta = (target - today.weekday()) % 7
    if delta == 0:
        delta = 7
    return today + timedelta(days=delta)


def _parse_date_phrase(text: str, today: date) -> Optional[date]:
    t = text.lower()
    if "today" in t:
        return today
    if "tomorrow" in t:
        return today + timedelta(days=1)
    for name in _WEEKDAYS:
        if re.search(rf"\bnext\s+{name}\b", t) or re.search(rf"\b{name}\b", t):
            if f"next {name}" in t:
                return resolve_next_weekday(name, today=today)
            # bare weekday → upcoming occurrence (including today)
            target = _WEEKDAYS[name]
            delta = (target - today.weekday()) % 7
            return today + timedelta(days=delta)
    m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", t)
    if m:
        return date.fromisoformat(m.group(1))
    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", t)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
        year = int(y) if y else today.year
        if year < 100:
            year += 2000
        try:
            return date(year, mo, d)
        except ValueError:
            try:
                return date(year, d, mo)
            except ValueError:
                return None
    return None


def _parse_times(text: str) -> tuple[Optional[str], Optional[str]]:
    times = re.findall(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", text)
    if len(times) >= 2:
        a = f"{int(times[0][0]):02d}:{times[0][1]}"
        b = f"{int(times[1][0]):02d}:{times[1][1]}"
        return a, b
    return None, None


def _match_sites(db: Session, company_id: int, text: str) -> list[Site]:
    sites = (
        db.query(Site)
        .filter(Site.company_id == company_id, Site.deleted_at.is_(None))
        .order_by(Site.name.asc())
        .limit(500)
        .all()
    )
    lower = text.lower()
    hits = [s for s in sites if s.name and s.name.lower() in lower]
    if hits:
        return hits
    # fuzzy token: any site name word present
    soft = []
    for s in sites:
        tokens = [w for w in re.split(r"\W+", (s.name or "").lower()) if len(w) > 2]
        if tokens and all(tok in lower for tok in tokens[:2]):
            soft.append(s)
    return soft[:5]


def _match_guards(db: Session, company_id: int, text: str) -> list[Guard]:
    guards = (
        db.query(Guard)
        .filter(Guard.company_id == company_id, Guard.deleted_at.is_(None))
        .order_by(Guard.full_name.asc())
        .limit(800)
        .all()
    )
    lower = text.lower()
    named = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b", text)
    # also try lowercase names after "for "
    for_chunk = re.search(r"\bfor\s+(.+?)(?:\s+from\s+|\s+as\s+|$)", text, re.I)
    candidates: list[str] = list(named)
    if for_chunk:
        chunk = for_chunk.group(1)
        candidates.extend(re.split(r",| and | & ", chunk, flags=re.I))
    cleaned = [c.strip() for c in candidates if c and len(c.strip()) > 1]
    hits: list[Guard] = []
    seen = set()
    for c in cleaned:
        cl = c.lower().strip()
        if cl in {"site", "morning", "evening", "night", "door", "supervisor", "room", "attendant"}:
            continue
        for g in guards:
            name = (g.full_name or "").lower()
            if not name or g.id in seen:
                continue
            if name == cl or name.startswith(cl) or cl in name.split():
                hits.append(g)
                seen.add(g.id)
                break
    return hits


def _existing_conflicts(
    db: Session,
    company_id: int,
    guard_id: int,
    when: date,
    start: str,
    end: str,
) -> list[str]:
    rows = (
        db.query(Assignment)
        .filter(Assignment.guard_id == guard_id, Assignment.date == when)
        .all()
    )
    # ensure assignment's site belongs to company via join already implied by create path;
    # filter by loading related guards in company
    msgs = []
    for a in rows:
        if not a.shift_start or not a.shift_end:
            continue
        if intervals_overlap(start, end, a.shift_start, a.shift_end):
            msgs.append(
                f"Overlaps existing shift {a.shift_start}–{a.shift_end} (assignment #{a.id})"
            )
    return msgs


def parse_shift_request(db: Session, user: User, message: str) -> dict[str, Any]:
    if is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    company = get_company_by_user_id(db, user.id)
    today = date.today()
    when = _parse_date_phrase(message, today) or (today + timedelta(days=1))
    start, end = _parse_times(message)
    if not start or not end:
        start, end = "09:00", "17:00"
    sites = _match_sites(db, company.id, message)
    guards = _match_guards(db, company.id, message)
    job = None
    m_job = re.search(r"\bas\s+([A-Za-z ]{3,40})", message, re.I)
    if m_job:
        job = m_job.group(1).strip().rstrip(".")

    if not sites:
        raise HTTPException(
            status_code=422,
            detail="Could not identify a site in your company from that request. Name the site exactly.",
        )
    if not guards:
        raise HTTPException(
            status_code=422,
            detail="Could not identify staff in your company from that request. Use exact names.",
        )

    site = sites[0]
    proposed = []
    warnings = []
    for g in guards:
        conflicts = _existing_conflicts(db, company.id, g.id, when, start, end)
        item = {
            "guard_id": g.id,
            "guard_name": g.full_name,
            "site_id": site.id,
            "site_name": site.name,
            "date": when.isoformat(),
            "shift_start": start,
            "shift_end": end,
            "job_title": job,
            "conflicts": conflicts,
        }
        proposed.append(item)
        warnings.extend([f"{g.full_name}: {c}" for c in conflicts])

    # mutual overlaps within proposal
    for i in range(len(proposed)):
        for j in range(i + 1, len(proposed)):
            if proposed[i]["guard_id"] == proposed[j]["guard_id"]:
                if intervals_overlap(
                    proposed[i]["shift_start"],
                    proposed[i]["shift_end"],
                    proposed[j]["shift_start"],
                    proposed[j]["shift_end"],
                ):
                    warnings.append(f"Proposal double-books {proposed[i]['guard_name']}")

    proposal = {
        "id": str(uuid4()),
        "company_id": company.id,
        "user_id": user.id,
        "exp": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        "shifts": proposed,
        "warnings": warnings,
        "summary": (
            f"Create {len(proposed)} shift(s) at {site.name} on {when.isoformat()} "
            f"{start}–{end} for: {', '.join(g.full_name for g in guards)}."
        ),
    }
    proposal["sig"] = _sign({k: proposal[k] for k in ("id", "company_id", "user_id", "exp", "shifts")})
    return proposal


def confirm_shift_proposal(db: Session, user: User, proposal: dict) -> dict[str, Any]:
    if is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    company = get_company_by_user_id(db, user.id)
    if int(proposal.get("company_id") or 0) != company.id or int(proposal.get("user_id") or 0) != user.id:
        raise HTTPException(status_code=403, detail="Proposal does not belong to this user")
    exp = datetime.fromisoformat(proposal["exp"])
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Proposal expired — ask again")
    check = {k: proposal[k] for k in ("id", "company_id", "user_id", "exp", "shifts")}
    if not hmac.compare_digest(proposal.get("sig") or "", _sign(check)):
        raise HTTPException(status_code=400, detail="Invalid proposal signature")

    created = []
    errors = []
    for item in proposal.get("shifts") or []:
        if item.get("conflicts"):
            errors.append(f"Skipped {item.get('guard_name')}: {', '.join(item['conflicts'])}")
            continue
        try:
            row = assignment_service.create_assignment(
                db,
                AssignmentCreate(
                    guard_id=int(item["guard_id"]),
                    site_id=int(item["site_id"]),
                    date=date.fromisoformat(item["date"]),
                    shift_start=item["shift_start"],
                    shift_end=item["shift_end"],
                    break_minutes=30,
                    shift_type="day",
                ),
                user.id,
            )
            created.append({"assignment_id": row.id, "guard_name": item.get("guard_name")})
        except HTTPException as e:
            errors.append(f"{item.get('guard_name')}: {e.detail}")
        except Exception as e:
            errors.append(f"{item.get('guard_name')}: {e}")

    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="assistant_rota_confirm",
        entity_type="assistant",
        entity_id=None,
        meta={"proposal_id": proposal.get("id"), "created": len(created), "errors": errors[:20]},
    )
    db.commit()
    return {"created": created, "errors": errors, "summary": proposal.get("summary")}
