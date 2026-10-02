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

_STOP = {
    "create", "shift", "shifts", "at", "on", "from", "to", "for", "the", "a", "an",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "next", "today", "tomorrow", "morning", "evening", "night", "please", "add",
    "assign", "staff", "employee", "guard", "site", "hotel", "as", "and", "with",
}


def _sign(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hmac.new((settings.secret_key or "controlops").encode(), raw.encode(), hashlib.sha256).hexdigest()


def _time_to_minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def intervals_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
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
        if re.search(rf"\bnext\s+{name}\b", t):
            return resolve_next_weekday(name, today=today)
        if re.search(rf"\b{name}\b", t):
            target = _WEEKDAYS[name]
            delta = (target - today.weekday()) % 7
            return today + timedelta(days=delta)
    m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", t)
    if m:
        return date.fromisoformat(m.group(1))
    m = re.search(r"\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b", t, re.I)
    if m:
        months = {n: i for i, n in enumerate(
            ["january","february","march","april","may","june","july","august","september","october","november","december"], 1)}
        try:
            return date(today.year, months[m.group(2).lower()], int(m.group(1)))
        except ValueError:
            return None
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
        return f"{int(times[0][0]):02d}:{times[0][1]}", f"{int(times[1][0]):02d}:{times[1][1]}"
    return None, None


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _score_name(query: str, full: str) -> float:
    q = (query or "").strip().lower()
    n = (full or "").strip().lower()
    if not q or not n:
        return 0.0
    if q == n:
        return 100.0
    if n.startswith(q) or q.startswith(n):
        return 90.0
    parts = n.split()
    if q in parts:
        return 85.0
    if any(p.startswith(q) for p in parts):
        return 80.0
    if q in n:
        return 70.0
    dist = _levenshtein(q, n)
    if dist <= 2 and len(q) >= 3:
        return 65.0 - dist
    for p in parts:
        d = _levenshtein(q, p)
        if d <= 2 and len(q) >= 3:
            return 60.0 - d
    # token fuzzy against multi-word
    q_tokens = [t for t in re.split(r"\W+", q) if t]
    if q_tokens and all(any(_levenshtein(t, p) <= 1 or t in p or p.startswith(t) for p in parts) for t in q_tokens):
        return 55.0
    return 0.0


def _extract_name_candidates(text: str) -> list[str]:
    out: list[str] = []
    for_chunk = re.search(
        r"\b(?:for|assign|create)\s+([A-Za-z][A-Za-z\-']+(?:\s+[A-Za-z][A-Za-z\-']+){0,3})\b",
        text,
        re.I,
    )
    if for_chunk:
        out.append(for_chunk.group(1).strip())
    # CapWords sequences
    out.extend(re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b", text))
    # lowercase first names after create
    m = re.search(r"\bcreate\s+([a-zA-Z\-']+)\s+", text, re.I)
    if m:
        out.append(m.group(1))
    cleaned = []
    seen = set()
    for c in out:
        cl = c.strip()
        if not cl or cl.lower() in _STOP or cl.lower() in seen:
            continue
        seen.add(cl.lower())
        cleaned.append(cl)
    return cleaned


def _rank_guards(guards: list[Guard], text: str) -> list[tuple[float, Guard]]:
    scored: list[tuple[float, Guard]] = []
    for cand in _extract_name_candidates(text):
        for g in guards:
            s = _score_name(cand, g.full_name or "")
            if s >= 55:
                scored.append((s, g))
    # also whole-message soft: first token after create
    by_id: dict[int, float] = {}
    for s, g in scored:
        by_id[g.id] = max(by_id.get(g.id, 0), s)
    ranked = sorted(((s, g) for g in guards if (s := by_id.get(g.id, 0)) > 0), key=lambda x: -x[0])
    return ranked


def _rank_sites(sites: list[Site], text: str) -> list[tuple[float, Site]]:
    lower = text.lower()
    ranked: list[tuple[float, Site]] = []
    for s in sites:
        name = (s.name or "").strip()
        if not name:
            continue
        score = _score_name(name, name) if name.lower() in lower else 0.0
        if name.lower() in lower:
            score = 95.0
        else:
            # score against substrings of message that look like place names
            for cand in re.findall(r"\b([A-Za-z][A-Za-z0-9&\-']+(?:\s+[A-Za-z0-9&\-']+){0,4})\b", text):
                if cand.lower() in _STOP:
                    continue
                score = max(score, _score_name(cand, name))
            tokens = [w for w in re.split(r"\W+", name.lower()) if len(w) > 2]
            if tokens and sum(1 for t in tokens if t in lower) >= max(1, len(tokens) - 1):
                score = max(score, 70.0)
        if score >= 55:
            ranked.append((score, s))
    ranked.sort(key=lambda x: -x[0])
    # dedupe
    seen = set()
    out = []
    for s, site in ranked:
        if site.id in seen:
            continue
        seen.add(site.id)
        out.append((s, site))
    return out


def _existing_conflicts(db: Session, guard_id: int, when: date, start: str, end: str) -> list[str]:
    rows = db.query(Assignment).filter(Assignment.guard_id == guard_id, Assignment.date == when).all()
    msgs = []
    for a in rows:
        if not a.shift_start or not a.shift_end:
            continue
        if intervals_overlap(start, end, a.shift_start, a.shift_end):
            msgs.append(f"Overlaps existing shift {a.shift_start}–{a.shift_end} (assignment #{a.id})")
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

    sites = (
        db.query(Site)
        .filter(Site.company_id == company.id, Site.deleted_at.is_(None))
        .order_by(Site.name.asc())
        .limit(500)
        .all()
    )
    guards = (
        db.query(Guard)
        .filter(Guard.company_id == company.id, Guard.deleted_at.is_(None))
        .order_by(Guard.full_name.asc())
        .limit(800)
        .all()
    )

    site_hits = _rank_sites(sites, message)
    guard_hits = _rank_guards(guards, message)

    if not site_hits:
        raise HTTPException(
            status_code=422,
            detail="Could not identify a site. Try naming the site (even with a small spelling difference).",
        )
    if not guard_hits:
        raise HTTPException(
            status_code=422,
            detail="Could not identify staff. Use a first name or full name from your workforce list.",
        )

    # Disambiguation: close scores among top matches
    top_site_score = site_hits[0][0]
    ambiguous_sites = [s for sc, s in site_hits if sc >= top_site_score - 8][:6]
    if len(ambiguous_sites) > 1:
        options = [{"id": s.id, "name": s.name} for s in ambiguous_sites]
        return {
            "needs_clarification": True,
            "clarification_type": "site",
            "options": options,
            "message": "Several sites match. Which site should this shift use?",
            "partial": {"date": when.isoformat(), "shift_start": start, "shift_end": end},
        }

    top_guard_score = guard_hits[0][0]
    ambiguous_guards = [g for sc, g in guard_hits if sc >= top_guard_score - 8][:8]
    # If multiple different people matched at similar scores, ask
    if len(ambiguous_guards) > 1:
        options = [{"id": g.id, "name": g.full_name} for g in ambiguous_guards]
        return {
            "needs_clarification": True,
            "clarification_type": "guard",
            "options": options,
            "message": "Several employees match that name. Who should this shift be for?",
            "partial": {
                "site_id": site_hits[0][1].id,
                "site_name": site_hits[0][1].name,
                "date": when.isoformat(),
                "shift_start": start,
                "shift_end": end,
            },
        }

    site = site_hits[0][1]
    chosen_guards = [guard_hits[0][1]]

    job = None
    m_job = re.search(r"\bas\s+([A-Za-z ]{3,40})", message, re.I)
    if m_job:
        job = m_job.group(1).strip().rstrip(".")

    proposed = []
    warnings = []
    for g in chosen_guards:
        conflicts = _existing_conflicts(db, g.id, when, start, end)
        proposed.append({
            "guard_id": g.id,
            "guard_name": g.full_name,
            "site_id": site.id,
            "site_name": site.name,
            "date": when.isoformat(),
            "shift_start": start,
            "shift_end": end,
            "job_title": job,
            "conflicts": conflicts,
        })
        warnings.extend([f"{g.full_name}: {c}" for c in conflicts])

    proposal = {
        "id": str(uuid4()),
        "company_id": company.id,
        "user_id": user.id,
        "exp": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        "shifts": proposed,
        "warnings": warnings,
        "needs_clarification": False,
        "summary": (
            f"Create {len(proposed)} shift(s) at {site.name} on {when.isoformat()} "
            f"{start}–{end} for: {', '.join(g.full_name for g in chosen_guards)}."
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
        entity_type="assignment",
        details=f"created={len(created)} errors={len(errors)}",
    )
    return {"created": created, "errors": errors, "count": len(created)}
