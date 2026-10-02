from __future__ import annotations

import json
import re
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from datetime import date, timedelta
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Client, Guard, Invoice, Site, User
from app.rbac import user_has_permission_db
from app.services import assistant_knowledge, assistant_rota, attendance_service, audit_service
from app.services.company_service import get_company_by_user_id
from app.services.portal_access import is_portal_role, is_staff_portal_user

_RATE: dict[int, deque] = defaultdict(deque)
_RATE_LOCK = threading.Lock()
_OLLAMA_SEM = threading.Semaphore(1)

NAV_HINTS = {
    "rota": "/rota",
    "attendance": "/attendance",
    "payroll": "/payroll",
    "invoice": "/invoices",
    "invoices": "/invoices",
    "site": "/sites",
    "sites": "/sites",
    "staff": "/guards",
    "guards": "/guards",
    "client": "/clients",
    "clients": "/clients",
    "billing": "/settings/billing",
    "settings": "/settings/company",
    "incident": "/incidents",
    "occurrence": "/occurrence-sheets",
    "accident": "/accident-reports",
    "dashboard": "/dashboard",
    "admin": "/admin",
}


def _rate_limit(user_id: int) -> None:
    now = time.time()
    with _RATE_LOCK:
        q = _RATE[user_id]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= int(getattr(settings, "assistant_rate_per_minute", 30) or 30):
            raise HTTPException(status_code=429, detail="Assistant rate limit exceeded. Try again shortly.")
        q.append(now)


def _can_module(db: Session, user: User, module: str, action: str = "view") -> bool:
    if (getattr(user, "role", None) or "").lower() == "super_admin":
        return False  # tenant modules not for platform ops via tenant tools
    return user_has_permission_db(db, user, f"{module}.{action}")


def _sanitize_output(text: str) -> str:
    banned = (
        r"(?i)(password|api[_ ]?key|secret[_ ]?key|private[_ ]?key|card[_ ]?number|cvv|ssn)",
    )
    out = text or ""
    for pat in banned:
        out = re.sub(pat, "[redacted]", out)
    return out[:8000]


def _optional_llm(system: str, user_msg: str, context: str) -> Optional[str]:
    base = (getattr(settings, "assistant_llm_url", None) or "").strip()
    if not base:
        return None
    model = (getattr(settings, "assistant_llm_model", None) or "llama3.2:1b").strip()
    timeout = float(getattr(settings, "assistant_llm_timeout_seconds", 8) or 8)
    url = base.rstrip("/") + "/api/chat"
    payload = {
        "model": model,
        "stream": False,
        "options": {"num_predict": 256, "temperature": 0.2},
        "messages": [
            {
                "role": "system",
                "content": (
                    system
                    + "\nUse ONLY the provided context. If missing, say you do not have that information. "
                    "Never invent staff, sites, money, or permissions. Never reveal secrets."
                ),
            },
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion:\n{user_msg}"},
        ],
    }
    if not _OLLAMA_SEM.acquire(blocking=False):
        return None
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode() or "{}")
        msg = (data.get("message") or {}).get("content")
        return msg.strip() if isinstance(msg, str) and msg.strip() else None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None
    finally:
        _OLLAMA_SEM.release()


def _nav_suggestions(message: str, user: User) -> list[dict]:
    lower = message.lower()
    role = (user.role or "").lower()
    out = []
    for key, href in NAV_HINTS.items():
        if key in lower:
            if role == "super_admin" and href.startswith("/") and href not in ("/admin", "/help"):
                if href != "/admin":
                    continue
            out.append({"label": key.title(), "href": href if role != "super_admin" or key == "admin" else "/admin"})
    # dedupe
    seen = set()
    uniq = []
    for n in out:
        if n["href"] in seen:
            continue
        seen.add(n["href"])
        uniq.append(n)
    return uniq[:6]


def _tool_search(db: Session, user: User, message: str) -> list[dict]:
    if (user.role or "").lower() == "super_admin":
        return []
    company = get_company_by_user_id(db, user.id)
    q = message.strip()
    # extract search phrase after "find" / "search"
    m = re.search(r"\b(?:find|search|look up|locate)\s+(.+)$", q, re.I)
    needle = (m.group(1) if m else q).strip()[:80]
    if len(needle) < 2:
        return []
    results = []
    like = f"%{needle}%"
    if _can_module(db, user, "guards") and not is_staff_portal_user(user):
        for g in (
            db.query(Guard)
            .filter(Guard.company_id == company.id, Guard.full_name.ilike(like), Guard.deleted_at.is_(None))
            .limit(8)
            .all()
        ):
            results.append({"type": "staff", "id": g.id, "label": g.full_name, "href": "/guards"})
    if _can_module(db, user, "sites"):
        for s in (
            db.query(Site)
            .filter(Site.company_id == company.id, Site.name.ilike(like), Site.deleted_at.is_(None))
            .limit(8)
            .all()
        ):
            results.append({"type": "site", "id": s.id, "label": s.name, "href": "/sites"})
    if _can_module(db, user, "clients") and not is_portal_role(user):
        for c in (
            db.query(Client)
            .filter(Client.company_id == company.id, Client.name.ilike(like))
            .limit(8)
            .all()
        ):
            results.append({"type": "client", "id": c.id, "label": c.name, "href": "/clients"})
    return results


def _tool_attendance_summary(db: Session, user: User) -> Optional[str]:
    if not _can_module(db, user, "attendance"):
        return None
    end = date.today()
    start = end - timedelta(days=7)
    rows = attendance_service.get_all_attendance(
        db, user.id, start_date=start, end_date=end
    )
    by_status: dict[str, int] = defaultdict(int)
    for r in rows or []:
        st = getattr(r, "status", None) or "unknown"
        by_status[str(st)] += 1
    if not by_status:
        return "No attendance records in the last 7 days for your scope."
    parts = ", ".join(f"{k}: {v}" for k, v in sorted(by_status.items(), key=lambda x: -x[1]))
    return f"Attendance last 7 days ({len(rows)} records): {parts}."


def _tool_invoice_summary(db: Session, user: User) -> Optional[str]:
    if not _can_module(db, user, "invoices") or is_portal_role(user):
        return None
    company = get_company_by_user_id(db, user.id)
    rows = (
        db.query(Invoice)
        .filter(Invoice.company_id == company.id)
        .order_by(Invoice.id.desc())
        .limit(200)
        .all()
    )
    openish = [i for i in rows if (i.status or "").lower() not in ("paid", "void", "cancelled", "voided")]
    total_open = sum(float(i.total or 0) for i in openish)
    return (
        f"Recent invoices sampled: {len(rows)}. Not marked paid/void: {len(openish)}. "
        f"Sum of totals on that sample: {total_open:.2f}."
    )


def _tool_shift_count(db: Session, user: User) -> Optional[str]:
    if not _can_module(db, user, "rota"):
        return None
    from app.models import Assignment

    company = get_company_by_user_id(db, user.id)
    guard_ids = [r[0] for r in db.query(Guard.id).filter(Guard.company_id == company.id).all()]
    if not guard_ids:
        return "No staff in this company, so no shifts this month."
    start = date.today().replace(day=1)
    count = (
        db.query(Assignment)
        .filter(Assignment.guard_id.in_(guard_ids), Assignment.date >= start)
        .count()
    )
    return f"Shifts on or after {start.isoformat()} (this month onwards): {count}."


def chat(
    db: Session,
    user: User,
    message: str,
    *,
    path: Optional[str] = None,
    confirm_proposal: Optional[dict] = None,
) -> dict[str, Any]:
    _rate_limit(user.id)
    msg = (message or "").strip()
    if len(msg) > 2000:
        raise HTTPException(status_code=422, detail="Message too long (max 2000 characters)")
    if not msg and not confirm_proposal:
        raise HTTPException(status_code=422, detail="Message required")

    actions: list[dict] = []
    proposal = None
    lower = msg.lower()

    # Confirm rota proposal
    if confirm_proposal:
        if not _can_module(db, user, "rota", "create"):
            raise HTTPException(status_code=403, detail="Missing rota.create permission")
        result = assistant_rota.confirm_shift_proposal(db, user, confirm_proposal)
        text = (
            f"Created {len(result['created'])} assignment(s)."
            + (f" Issues: {'; '.join(result['errors'])}" if result["errors"] else "")
        )
        return {
            "reply": _sanitize_output(text),
            "sources": [],
            "navigation": [{"label": "Rota", "href": "/rota"}],
            "proposal": None,
            "actions": [{"type": "rota_confirm", "result": result}],
            "mode": "tools",
        }

    # Rota NL create intent
    if re.search(r"\b(create|add|schedule|make)\b.*\bshift", lower) or (
        "create" in lower and "shift" in lower
    ):
        if not _can_module(db, user, "rota", "create"):
            reply = "You do not have permission to create shifts. Ask a manager with Rota create access."
        else:
            try:
                proposal = assistant_rota.parse_shift_request(db, user, msg)
                if proposal.get("needs_clarification"):
                    reply = proposal.get("message") or "Please clarify which record to use."
                    options = proposal.get("options") or []
                    reply += "\n" + "\n".join(f"- {o.get('name')}" for o in options)
                    actions.append({"type": "rota_clarify", "clarification_type": proposal.get("clarification_type")})
                else:
                    warn = proposal.get("warnings") or []
                    reply = (
                        f"Proposed: {proposal['summary']}\n"
                        + (f"Warnings: {'; '.join(warn)}\n" if warn else "")
                        + "Confirm to create these assignments through ControlOps validation, or cancel."
                    )
                    actions.append({"type": "rota_propose", "requires_confirm": True})
            except HTTPException as e:
                reply = str(e.detail)
        audit_service.log_action(
            db,
            company_id=getattr(get_company_by_user_id(db, user.id), "id", None)
            if (user.role or "") != "super_admin"
            else None,
            user_id=user.id,
            action="assistant_chat",
            entity_type="assistant",
            meta={"path": path, "intent": "rota_propose"},
        )
        try:
            db.commit()
        except Exception:
            db.rollback()
        return {
            "reply": _sanitize_output(reply),
            "sources": [],
            "navigation": [{"label": "Rota", "href": "/rota"}],
            "proposal": proposal,
            "actions": actions,
            "mode": "tools",
        }

    module_allowed = lambda m: _can_module(db, user, m) if (user.role or "").lower() != "super_admin" else False

    def module_filter(m: str) -> bool:
        return module_allowed(m)

    hits = assistant_knowledge.find_knowledge(user, msg, module_allowed=module_filter, limit=4)
    # If query is general product and user is super_admin, also allow tenant how-to without module gate
    if (user.role or "").lower() == "super_admin" and not hits:
        hits = assistant_knowledge.find_knowledge(user, msg, module_allowed=lambda _m: True, limit=4)

    context_bits = []
    sources = []
    for h in hits:
        context_bits.append(f"## {h['title']}\n{h['body']}")
        sources.append({"id": h["id"], "title": h["title"], "href": h.get("href")})

    if path:
        context_bits.insert(0, f"User is currently viewing: {path}")

    tool_notes = []
    if re.search(r"\b(find|search|look up|locate)\b", lower):
        found = _tool_search(db, user, msg)
        if found:
            tool_notes.append("Search results: " + "; ".join(f"{f['type']} {f['label']}" for f in found))
            actions.append({"type": "search", "results": found})
        elif (user.role or "").lower() != "super_admin":
            tool_notes.append("No matching staff/sites/clients found in your company for that query.")

    if re.search(r"\battendance\b", lower) and re.search(r"\b(summar|exception|late|no-?show|pattern)\b", lower):
        note = _tool_attendance_summary(db, user)
        if note:
            tool_notes.append(note)
            actions.append({"type": "attendance_summary"})
        elif not _can_module(db, user, "attendance"):
            tool_notes.append("Attendance data is not available for your role.")

    if re.search(r"\binvoice|outstanding|balance\b", lower):
        note = _tool_invoice_summary(db, user)
        if note:
            tool_notes.append(note)
            actions.append({"type": "invoice_summary"})

    if re.search(r"\bhow many shifts|shift(s)? (this|completed)|summarise (this )?month.?s? rota|rota summary\b", lower):
        note = _tool_shift_count(db, user)
        if note:
            tool_notes.append(note)
            actions.append({"type": "shift_count"})

    context = "\n\n".join(context_bits + tool_notes)
    llm = _optional_llm(
        "You are the ControlOps in-app assistant. Stay within RBAC context.",
        msg,
        context or "No matching knowledge.",
    )

    if llm:
        reply = llm
        mode = "llm"
    elif hits or tool_notes:
        parts = []
        if hits:
            top = hits[0]
            parts.append(f"**{top['title']}**\n{top['body']}")
            if len(hits) > 1:
                parts.append("Related: " + ", ".join(h["title"] for h in hits[1:]))
        parts.extend(tool_notes)
        reply = "\n\n".join(parts)
        mode = "retrieval"
    else:
        reply = (
            "I could not find matching ControlOps guidance for that within your permissions. "
            "Try naming a module (Rota, Attendance, Payroll, Invoices) or open Help. "
            "I will not invent features or data."
        )
        mode = "fallback"

    nav = _nav_suggestions(msg, user)
    if path and path.startswith("/rota"):
        nav = [{"label": "Rota", "href": "/rota"}] + [n for n in nav if n["href"] != "/rota"]

    company_id = None
    if (user.role or "").lower() != "super_admin":
        try:
            company_id = get_company_by_user_id(db, user.id).id
        except Exception:
            company_id = None

    audit_service.log_action(
        db,
        company_id=company_id,
        user_id=user.id,
        action="assistant_chat",
        entity_type="assistant",
        meta={"path": path, "mode": mode, "sources": [s["id"] for s in sources]},
    )
    try:
        db.commit()
    except Exception:
        db.rollback()

    return {
        "reply": _sanitize_output(reply),
        "sources": sources,
        "navigation": nav,
        "proposal": None,
        "actions": actions,
        "mode": mode,
    }
