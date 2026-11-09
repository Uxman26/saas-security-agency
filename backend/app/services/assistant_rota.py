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
from app.services.rota_service import normalize_shift_type

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
    "next", "today", "tomorrow", "morning", "afternoon", "evening", "night", "please",
    "add", "assign", "book", "schedule", "make", "put", "staff", "employee", "guard",
    "site", "hotel", "as", "and", "with", "rota", "duty", "assignment", "assignments",
}


def looks_like_rota_modify(message: str) -> bool:
    """True when the user asks to change/move/cancel an existing shift via NL."""
    lower = (message or "").lower()
    if not re.search(r"\b(shift|shifts|rota|duty|assignment)s?\b", lower):
        return False
    return bool(
        re.search(
            r"\b(move|change|update|edit|reschedule|cancel|delete|remove|swap|reassign)\b",
            lower,
        )
    )


def looks_like_rota_recurring(message: str) -> bool:
    """True when the user asks for weekly/recurring generation (not supported in AI create)."""
    lower = (message or "").lower()
    return bool(
        re.search(
            r"\b(every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|day)|"
            r"recurring|weekly|fortnightly|each\s+week|repeat\s+(every|weekly))\b",
            lower,
        )
    )


def unsupported_rota_nl_reply(message: str) -> Optional[str]:
    """Honest guidance when NL asks for features AI Rota cannot create safely."""
    if looks_like_rota_modify(message):
        return (
            "AI Rota can propose new shifts, but it cannot safely modify, move, cancel, or "
            "swap existing shifts from chat. Open the rota calendar, edit the shift there, "
            "then Publish — that keeps validation and permissions intact."
        )
    if looks_like_rota_recurring(message):
        return (
            "AI Rota creates one-off shifts only. For weekly or recurring patterns, add the "
            "first shift with a clear date and times (or use the rota calendar’s recurring "
            "tools if available), then confirm — I will not invent a repeating series from chat."
        )
    return None


def looks_like_rota_create(message: str) -> bool:
    """True when the message is asking to create/schedule a shift (not general Q&A)."""
    lower = (message or "").lower()
    if unsupported_rota_nl_reply(message):
        # Still treat as rota intent so we return the guidance reply on this path.
        return True
    if re.search(
        r"\b(create|add|schedule|make|book|assign|put|set\s+up)\b.{0,100}\b(shift|shifts|rota|duty|assignment)s?\b",
        lower,
        re.S,
    ):
        return True
    if re.search(r"\b(shift|rota|duty)\b.{0,60}\b(for|at|on)\b", lower):
        return True
    # Named period without clock: "morning shift for John at Hilton tomorrow"
    has_period = bool(re.search(r"\b(morning|afternoon|evening|night)\s+shift\b", lower))
    has_day = any(
        w in lower
        for w in (
            "today",
            "tomorrow",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        )
    ) or bool(re.search(r"\b\d{4}-\d{2}-\d{2}\b", lower))
    # Compact: "John at Hilton tomorrow 09:00-17:00"
    has_clock = bool(re.search(r"\b([01]?\d|2[0-3])[:.][0-5]\d\b", lower)) or bool(
        re.search(r"\b([1-9]|1[0-2])\s*(a\.?m\.?|p\.?m\.?)\b", lower)
    ) or bool(re.search(r"\b([01]?\d|2[0-3])\s*[-–—]\s*([01]?\d|2[0-3])\b", lower))
    if has_day and re.search(r"\b(at|for)\b", lower) and (has_clock or has_period):
        return True
    return False


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
    if re.search(r"\btoday\b", t):
        return today
    if re.search(r"\btomorrow\b", t):
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
    m = re.search(
        r"\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b",
        t,
        re.I,
    )
    if m:
        months = {
            n: i
            for i, n in enumerate(
                [
                    "january",
                    "february",
                    "march",
                    "april",
                    "may",
                    "june",
                    "july",
                    "august",
                    "september",
                    "october",
                    "november",
                    "december",
                ],
                1,
            )
        }
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


def _hm(h: int, m: int = 0, ampm: Optional[str] = None) -> str:
    if ampm:
        ap = ampm.lower().replace(".", "")
        if ap.startswith("p") and h < 12:
            h += 12
        elif ap.startswith("a") and h == 12:
            h = 0
    if h < 0 or h > 23 or m < 0 or m > 59:
        raise ValueError("invalid time")
    return f"{h:02d}:{m:02d}"


def _parse_times(text: str) -> tuple[Optional[str], Optional[str]]:
    """Parse start/end from HH:MM, 9am/5pm, or 9-17 / 9-5 style ranges."""
    found: list[str] = []

    for m in re.finditer(
        r"\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?\b",
        text,
        re.I,
    ):
        try:
            found.append(_hm(int(m.group(1)), int(m.group(2)), m.group(3)))
        except ValueError:
            continue

    if len(found) < 2:
        for m in re.finditer(r"\b([1-9]|1[0-2])\s*(a\.?m\.?|p\.?m\.?)\b", text, re.I):
            try:
                found.append(_hm(int(m.group(1)), 0, m.group(2)))
            except ValueError:
                continue

    if len(found) >= 2:
        return found[0], found[1]

    m = re.search(
        r"\b([01]?\d|2[0-3])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:[-–—]|to)\s+"
        r"([01]?\d|2[0-3])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\b",
        text,
        re.I,
    )
    if m:
        try:
            sh = int(m.group(1))
            sm = int(m.group(2) or 0)
            sap = m.group(3)
            eh = int(m.group(4))
            em = int(m.group(5) or 0)
            eap = m.group(6)
            # Bare 9-5 → 09:00–17:00. Bare 21-7 stays overnight 21:00–07:00.
            if not sap and not eap and sh <= 11 and 1 <= eh <= 11 and eh < sh:
                eap = "pm"
            return _hm(sh, sm, sap), _hm(eh, em, eap)
        except ValueError:
            pass

    # Compact 9-5 / 21-7 without "to"
    m = re.search(r"\b([01]?\d|2[0-3])\s*[-–—]\s*([01]?\d|2[0-3])\b", text)
    if m:
        try:
            sh, eh = int(m.group(1)), int(m.group(2))
            sap = eap = None
            if sh <= 11 and 1 <= eh <= 11 and eh < sh:
                eap = "pm"
            return _hm(sh, 0, sap), _hm(eh, 0, eap)
        except ValueError:
            pass

    # Named periods when no explicit clock times (UK-style security windows).
    period = _parse_period_times(text)
    if period:
        return period

    return None, None


_PERIOD_WINDOWS = {
    "morning": ("06:00", "14:00"),
    "afternoon": ("14:00", "22:00"),
    "evening": ("18:00", "02:00"),
    "night": ("21:00", "07:00"),
}


def _parse_period_times(text: str) -> Optional[tuple[str, str]]:
    """Map morning/afternoon/evening/night wording to default start/end clocks.

    Only matches explicit period phrasing (e.g. "morning shift", "as night") so
    names like "Morning Star" do not invent times.
    """
    t = (text or "").lower()
    for name, window in _PERIOD_WINDOWS.items():
        if re.search(rf"\b{name}\s+shift\b", t):
            return window
        if re.search(rf"\bas\s+(a\s+)?{name}\b", t):
            return window
    return None


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
    q_tokens = [t for t in re.split(r"\W+", q) if t]
    if q_tokens and all(any(_levenshtein(t, p) <= 1 or t in p or p.startswith(t) for p in parts) for t in q_tokens):
        return 55.0
    return 0.0


def _extract_name_candidates(text: str) -> list[str]:
    out: list[str] = []
    for_chunk = re.search(
        r"\b(?:for|assign|create|book|schedule|add)\s+([A-Za-z][A-Za-z\-']+(?:\s+(?:and|&)\s+[A-Za-z][A-Za-z\-']+|\s+[A-Za-z][A-Za-z\-']+){0,5})\b",
        text,
        re.I,
    )
    if for_chunk:
        chunk = for_chunk.group(1).strip()
        parts = re.split(r"\s+(?:and|&)\s+", chunk, flags=re.I)
        out.extend(p.strip() for p in parts if p.strip())
    out.extend(re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b", text))
    m = re.search(r"\b(?:create|book|assign|schedule|add)\s+([a-zA-Z\-']+)\s+", text, re.I)
    if m:
        out.append(m.group(1))
    cleaned = []
    seen = set()
    for c in out:
        cl = c.strip()
        if not cl or cl.lower() in _STOP or cl.lower() in seen:
            continue
        if cl.lower() in _WEEKDAYS or cl.lower() in {"morning", "afternoon", "evening", "night"}:
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
    by_id: dict[int, float] = {}
    for s, g in scored:
        by_id[g.id] = max(by_id.get(g.id, 0), s)
    ranked = sorted(((s, g) for g in guards if (s := by_id.get(g.id, 0)) > 0), key=lambda x: -x[0])
    return ranked


def _pick_guards(guard_hits: list[tuple[float, Guard]], text: str) -> list[Guard]:
    """One person by default; multiple when the message names several people with 'and'/'&'."""
    if not guard_hits:
        return []
    candidates = _extract_name_candidates(text)
    multi = len(candidates) > 1 and bool(re.search(r"\b(and|&)\b", text, re.I))
    if not multi:
        return [guard_hits[0][1]]
    chosen: list[Guard] = []
    seen = set()
    for cand in candidates:
        best: Optional[tuple[float, Guard]] = None
        for s, g in guard_hits:
            score = _score_name(cand, g.full_name or "")
            if score < 55:
                continue
            if best is None or score > best[0]:
                best = (score, g)
        if best and best[1].id not in seen:
            seen.add(best[1].id)
            chosen.append(best[1])
    return chosen or [guard_hits[0][1]]


def _rank_sites(sites: list[Site], text: str) -> list[tuple[float, Site]]:
    lower = text.lower()
    ranked: list[tuple[float, Site]] = []
    for s in sites:
        name = (s.name or "").strip()
        if not name:
            continue
        score = 0.0
        if name.lower() in lower:
            score = 95.0
        else:
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


def _load_company_catalog(db: Session, company_id: int) -> tuple[list[Site], list[Guard]]:
    sites = (
        db.query(Site)
        .filter(Site.company_id == company_id, Site.deleted_at.is_(None))
        .order_by(Site.name.asc())
        .limit(500)
        .all()
    )
    guards = (
        db.query(Guard)
        .filter(Guard.company_id == company_id, Guard.deleted_at.is_(None))
        .order_by(Guard.full_name.asc())
        .limit(800)
        .all()
    )
    return sites, guards


def _build_proposal(
    db: Session,
    user: User,
    company_id: int,
    *,
    site: Site,
    guards: list[Guard],
    when: date,
    start: str,
    end: str,
    job: Optional[str] = None,
) -> dict[str, Any]:
    proposed = []
    warnings = []
    for g in guards:
        conflicts = _existing_conflicts(db, g.id, when, start, end)
        proposed.append(
            {
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
        )
        warnings.extend([f"{g.full_name}: {c}" for c in conflicts])

    proposal = {
        "id": str(uuid4()),
        "company_id": company_id,
        "user_id": user.id,
        "exp": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        "shifts": proposed,
        "warnings": warnings,
        "needs_clarification": False,
        "summary": (
            f"Create {len(proposed)} shift(s) at {site.name} on {when.isoformat()} "
            f"{start}–{end} for: {', '.join(g.full_name for g in guards)}."
        ),
    }
    proposal["sig"] = _sign({k: proposal[k] for k in ("id", "company_id", "user_id", "exp", "shifts")})
    return proposal


def parse_shift_request(db: Session, user: User, message: str) -> dict[str, Any]:
    if is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    blocked = unsupported_rota_nl_reply(message)
    if blocked:
        return {
            "needs_clarification": True,
            "clarification_type": "unsupported",
            "options": [],
            "message": blocked,
            "partial": {"original_message": message},
        }
    company = get_company_by_user_id(db, user.id)
    today = date.today()
    when = _parse_date_phrase(message, today)
    start, end = _parse_times(message)

    missing: list[str] = []
    if when is None:
        missing.append("a date (e.g. tomorrow, Monday, or 2026-11-15)")
    if not start or not end:
        missing.append("start and end times (e.g. 09:00-17:00 or 9am-5pm)")
    if missing:
        return {
            "needs_clarification": True,
            "clarification_type": "missing_fields",
            "options": [],
            "message": (
                "I need more detail before creating a shift. Please include "
                + " and ".join(missing)
                + ". Example: “Create a shift for Alex at North Gate tomorrow 08:00-16:00”."
            ),
            "partial": {"original_message": message},
        }

    sites, guards = _load_company_catalog(db, company.id)
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

    top_site_score = site_hits[0][0]
    ambiguous_sites = [s for sc, s in site_hits if sc >= top_site_score - 8][:6]
    guard_names = [c for c in _extract_name_candidates(message)]
    if len(ambiguous_sites) > 1:
        options = [{"id": s.id, "name": s.name} for s in ambiguous_sites]
        return {
            "needs_clarification": True,
            "clarification_type": "site",
            "options": options,
            "message": "Several sites match. Which site should this shift use?",
            "partial": {
                "date": when.isoformat(),
                "shift_start": start,
                "shift_end": end,
                "guard_names": guard_names,
                "original_message": message,
            },
        }

    top_guard_score = guard_hits[0][0]
    ambiguous_guards = [g for sc, g in guard_hits if sc >= top_guard_score - 8][:8]
    # Ambiguous only when a single name maps to several people (not multi-staff "A and B").
    multi_named = len(guard_names) > 1 and bool(re.search(r"\b(and|&)\b", message, re.I))
    if len(ambiguous_guards) > 1 and not multi_named:
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
                "original_message": message,
            },
        }

    site = site_hits[0][1]
    chosen_guards = _pick_guards(guard_hits, message)

    job = None
    m_job = re.search(r"\bas\s+([A-Za-z ]{3,40})", message, re.I)
    if m_job:
        job = m_job.group(1).strip().rstrip(".")

    return _build_proposal(
        db,
        user,
        company.id,
        site=site,
        guards=chosen_guards,
        when=when,
        start=start,
        end=end,
        job=job,
    )


def apply_clarification(
    db: Session,
    user: User,
    *,
    clarification_type: str,
    selected_id: int,
    partial: dict[str, Any],
) -> dict[str, Any]:
    """Resolve a site/guard pick without re-parsing fragile natural language."""
    if is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    company = get_company_by_user_id(db, user.id)
    sites, guards = _load_company_catalog(db, company.id)

    date_raw = partial.get("date")
    start = partial.get("shift_start")
    end = partial.get("shift_end")
    original = (partial.get("original_message") or "").strip()

    if not date_raw or not start or not end:
        # Fall back to re-parse when the partial is incomplete.
        if original:
            return parse_shift_request(db, user, original)
        raise HTTPException(status_code=422, detail="Clarification is missing date or times.")

    when = date.fromisoformat(str(date_raw))
    start_s, end_s = str(start), str(end)

    if clarification_type == "site":
        site = next((s for s in sites if s.id == int(selected_id)), None)
        if not site:
            raise HTTPException(status_code=404, detail="Selected site not found")
        # Prefer names captured before clarification; else re-rank from original text.
        seed = original or " ".join(partial.get("guard_names") or [])
        if not seed:
            raise HTTPException(
                status_code=422,
                detail="Could not identify staff after site selection. Include the staff name and try again.",
            )
        guard_hits = _rank_guards(guards, seed)
        if not guard_hits:
            raise HTTPException(
                status_code=422,
                detail="Could not identify staff after site selection. Include the staff name and try again.",
            )
        chosen = _pick_guards(guard_hits, seed)
        return _build_proposal(
            db, user, company.id, site=site, guards=chosen, when=when, start=start_s, end=end_s
        )

    if clarification_type == "guard":
        guard = next((g for g in guards if g.id == int(selected_id)), None)
        if not guard:
            raise HTTPException(status_code=404, detail="Selected staff member not found")
        site_id = partial.get("site_id")
        site = next((s for s in sites if s.id == int(site_id)), None) if site_id else None
        if site is None and original:
            site_hits = _rank_sites(sites, original)
            site = site_hits[0][1] if site_hits else None
        if site is None:
            raise HTTPException(status_code=422, detail="Could not identify the site for this shift.")
        return _build_proposal(
            db, user, company.id, site=site, guards=[guard], when=when, start=start_s, end=end_s
        )

    raise HTTPException(status_code=422, detail="Unsupported clarification type")


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
            start = item["shift_start"]
            end = item["shift_end"]
            row = assignment_service.create_assignment(
                db,
                AssignmentCreate(
                    guard_id=int(item["guard_id"]),
                    site_id=int(item["site_id"]),
                    date=date.fromisoformat(item["date"]),
                    shift_start=start,
                    shift_end=end,
                    break_minutes=30,
                    shift_type=normalize_shift_type(None, start),
                ),
                user.id,
            )
            created.append({"assignment_id": row.id, "guard_name": item.get("guard_name")})
        except HTTPException as e:
            errors.append(f"{item.get('guard_name')}: {e.detail}")
        except Exception as e:
            errors.append(f"{item.get('guard_name')}: {e}")

    if not created and errors:
        # Surface a clear failure when every proposed shift was blocked.
        raise HTTPException(
            status_code=409,
            detail="No shifts were created. " + "; ".join(errors),
        )

    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="assistant_rota_confirm",
        entity_type="assignment",
        details=f"created={len(created)} errors={len(errors)}",
    )
    return {"created": created, "errors": errors, "count": len(created)}
