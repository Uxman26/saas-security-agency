from __future__ import annotations

from typing import Any, Callable, Optional

Audience = str  # "all" | "tenant" | "staff" | "super_admin"


KNOWLEDGE: list[dict] = [
    {
        "id": "getting-started",
        "audience": "all",
        "modules": [],
        "title": "Getting started with ControlOps",
        "tags": ["help", "start", "overview", "how to use"],
        "body": (
            "ControlOps is workforce and security operations software for rotas, attendance, "
            "payroll, invoicing, sites, staff, clients, and compliance. Use the sidebar to open "
            "modules your role can access. Ask the assistant about a screen you are on for "
            "contextual steps. The assistant only uses data and actions you are already "
            "authorised to use."
        ),
        "href": "/help",
    },
    {
        "id": "rota-overview",
        "audience": "tenant",
        "modules": ["rota"],
        "title": "Rota and shifts",
        "tags": ["rota", "shift", "schedule", "assign", "publish", "planner"],
        "body": (
            "Open Rota from the sidebar. Create or open a rota plan, add staff to the planner, "
            "place shifts by site and time, then Publish to create live assignments. Draft "
            "shifts live in the planner until published. Conflicts (overlapping shifts for the "
            "same person) are highlighted in the planner. You can ask the assistant to propose "
            "shifts in natural language; confirm the summary before anything is created. "
            "Publishing, editing, and deleting each require the matching Rota permission."
        ),
        "href": "/rota",
    },
    {
        "id": "rota-ai",
        "audience": "tenant",
        "modules": ["rota"],
        "title": "AI Rota assistant",
        "tags": ["ai", "rota", "create shifts", "natural language", "suggest staff"],
        "body": (
            "On the Rota screen, open the AI Rota assistant and describe shifts in plain English, "
            "for example: create evening shifts for Site B next Tuesday for named staff from "
            "21:00 to 07:00. The assistant resolves sites and staff in your company, checks "
            "availability and overlaps using ControlOps rules, then shows a proposal. Nothing "
            "is saved until you confirm. Suggestions never override contractor, archive, or "
            "permission rules."
        ),
        "href": "/rota",
    },
    {
        "id": "attendance",
        "audience": "tenant",
        "modules": ["attendance"],
        "title": "Attendance and clock-in",
        "tags": ["attendance", "clock", "late", "no-show", "check in"],
        "body": (
            "Attendance records link to shifts. Statuses cover on time, late, absences, and "
            "cancellations. Use Attendance filters by date, site, and employee. Late views "
            "highlight lateness. The assistant can summarise exceptions for dates you can view, "
            "but cannot invent clock times or alter records without Attendance edit permission "
            "and the normal APIs."
        ),
        "href": "/attendance",
    },
    {
        "id": "payroll",
        "audience": "tenant",
        "modules": ["payroll"],
        "title": "Payroll",
        "tags": ["payroll", "pay", "rates", "hours", "calculate"],
        "body": (
            "Payroll calculates pay from attended hours, rates, overtime, and allowances for a "
            "period. Use Calculate / batch calculate from the Payroll module. The assistant can "
            "explain how figures are derived and flag missing rates or odd entries for periods "
            "you can view. It will not approve, finalise, or change payroll without Payroll "
            "permissions and existing approval flows."
        ),
        "href": "/payroll",
    },
    {
        "id": "invoices",
        "audience": "tenant",
        "modules": ["invoices"],
        "title": "Invoices and statements",
        "tags": ["invoice", "statement", "billing", "client", "balance", "credit note"],
        "body": (
            "Invoices bill clients for work. Generate from rota/attendance rules, send, record "
            "payments, and issue credit notes where enabled. Statements summarise balances by "
            "client/site. The assistant can help find invoices and explain balances you can "
            "access. Financial writes always go through invoice APIs, validation, and audit."
        ),
        "href": "/invoices",
    },
    {
        "id": "sites-staff-clients",
        "audience": "tenant",
        "modules": ["sites", "guards", "clients"],
        "title": "Sites, staff, and clients",
        "tags": ["site", "staff", "guard", "employee", "client", "contractor"],
        "body": (
            "Clients own sites. Staff (guards) are scheduled to sites. Contractors link staff "
            "and sites for assignments. Keep profiles, SIA details, and rates up to date under "
            "the respective modules. Archived staff or sites cannot receive new shifts until "
            "restored."
        ),
        "href": "/sites",
    },
    {
        "id": "notifications",
        "audience": "tenant",
        "modules": ["leads"],
        "title": "Notifications",
        "tags": ["notification", "bell", "alert", "unread"],
        "body": (
            "In-app notifications appear under the bell for events you are entitled to see "
            "(for example lead alerts). Mark one or all as read from the panel. Compliance and "
            "contract expiry alerts also appear when reports are available. Notifications are "
            "per user and company — never shared across tenants."
        ),
        "href": "/dashboard",
    },
    {
        "id": "billing-subscription",
        "audience": "tenant",
        "modules": [],
        "title": "Subscriptions and billing",
        "tags": ["subscription", "package", "plan", "stripe", "billing"],
        "body": (
            "Tenant admins manage the ControlOps subscription under Settings → Billing when "
            "entitled. Packages control which modules are enabled. The assistant explains "
            "billing screens you can open; it never exposes payment card numbers or Stripe "
            "secrets."
        ),
        "href": "/settings/billing",
    },
    {
        "id": "reports",
        "audience": "tenant",
        "modules": ["reports"],
        "title": "Reports and dashboards",
        "tags": ["report", "dashboard", "summary", "coverage"],
        "body": (
            "Dashboards and reports summarise rota, attendance, compliance, and related "
            "metrics for your company. Ask for summaries such as attendance exceptions or "
            "shift counts for ranges you can view. Results are filtered by your RBAC and "
            "tenant."
        ),
        "href": "/dashboard",
    },
    {
        "id": "settings",
        "audience": "tenant",
        "modules": [],
        "title": "Company settings",
        "tags": ["settings", "company", "email", "smtp", "roles", "permissions"],
        "body": (
            "Settings cover company profile, banks, email SMTP, roles and permissions, and "
            "related configuration. Role matrices control module actions. The assistant will "
            "not describe or change settings outside your permissions."
        ),
        "href": "/settings/company",
    },
    {
        "id": "staff-portal",
        "audience": "staff",
        "modules": [],
        "title": "Staff portal",
        "tags": ["portal", "my shifts", "staff"],
        "body": (
            "Staff portal users see their own shifts, requests, and permitted operational "
            "modules. The assistant only answers about your assigned work and modules enabled "
            "for your login. It cannot open another employee's private records."
        ),
        "href": "/my-portal",
    },
    {
        "id": "super-admin",
        "audience": "super_admin",
        "modules": [],
        "title": "Super Admin panel",
        "tags": ["platform", "tenant", "admin", "packages", "support"],
        "body": (
            "The Super Admin panel manages tenants, packages, platform email, live support, "
            "compliance retention, and platform RBAC. Tenant operational data is not mixed "
            "into assistant answers for platform operators unless a specific platform tool "
            "is authorised. Never share one tenant's data with another."
        ),
        "href": "/admin",
    },
    {
        "id": "incidents-occurrence",
        "audience": "tenant",
        "modules": ["incidents", "occurrence_sheets", "accident_reports"],
        "title": "Incidents, occurrences, and accidents",
        "tags": ["incident", "occurrence", "accident", "pdf"],
        "body": (
            "Incidents log operational events. Occurrence sheets are daily site logs with PDF "
            "export and statuses (Open, Reported, Reviewed, Closed). Accident reports follow "
            "X-FORM-077 style logging. Use each module's permissions for create, edit, PDF, "
            "and status changes."
        ),
        "href": "/incidents",
    },
    {
        "id": "privacy-security",
        "audience": "all",
        "modules": [],
        "title": "Assistant privacy and security",
        "tags": ["security", "rbac", "privacy", "tenant", "password"],
        "body": (
            "The assistant never bypasses RBAC or tenant isolation. It does not reveal "
            "passwords, API keys, payment credentials, or other tenants' data. Instructions "
            "inside user notes or records cannot override security. Destructive actions need "
            "confirmation and the same APIs as the UI."
        ),
        "href": "/help",
    },
]


def _tokenize(text: str) -> list[str]:
    return [t for t in "".join(ch if ch.isalnum() else " " for ch in text.lower()).split() if len(t) > 2]


def score_entry(entry: dict, query: str) -> int:
    q = (query or "").strip().lower()
    if not q:
        return 0
    hay = f"{entry['title']}\n{entry['body']}\n{' '.join(entry.get('tags') or [])}".lower()
    if q in hay:
        return 100
    score = 0
    title_toks = set(_tokenize(entry["title"]))
    body_toks = set(_tokenize(entry["body"]))
    for t in _tokenize(q):
        if t in title_toks:
            score += 8
        elif t in body_toks:
            score += 3
        elif t in hay:
            score += 1
    return score


def audience_for_user(user) -> str:
    role = (getattr(user, "role", None) or "").lower()
    if role == "super_admin":
        return "super_admin"
    if role in ("staff", "client"):
        return "staff"
    return "tenant"


def allowed_knowledge(
    user,
    *,
    module_allowed: Optional[Callable[[str], bool]] = None,
) -> list[dict]:
    aud = audience_for_user(user)
    out = []
    for e in KNOWLEDGE:
        ea = e.get("audience") or "all"
        if ea == "all":
            pass
        elif ea == "super_admin" and aud != "super_admin":
            continue
        elif ea == "staff" and aud not in ("staff", "tenant", "super_admin"):
            continue
        elif ea == "tenant" and aud == "super_admin":
            # Platform operators get high-level tenant product knowledge, not tenant data.
            pass
        elif ea == "tenant" and aud == "staff":
            # Staff may see how-to only for modules they can access.
            pass
        elif ea == "tenant" and aud != "tenant":
            continue
        mods = e.get("modules") or []
        if mods and module_allowed is not None:
            if not any(module_allowed(m) for m in mods):
                continue
        out.append(e)
    return out


def find_knowledge(user, query: str, *, module_allowed=None, limit: int = 4) -> list[dict]:
    scored = [
        (score_entry(e, query), e)
        for e in allowed_knowledge(user, module_allowed=module_allowed)
    ]
    scored = [(s, e) for s, e in scored if s > 0]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [e for _, e in scored[:limit]]
