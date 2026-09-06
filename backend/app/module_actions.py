"""Granular per-module action catalogue.

Every module exposes the CRUD actions it actually implements plus the special
actions its routers expose (publish, approve, export, scan…). One entry here is one
tickable permission in Roles & Permissions and one ``module.action`` code.

``parent`` is what the action was gated by *before* granular permissions existed. It
serves two purposes:

* the migration grants a new action to any role that already held its parent, so
  nobody loses access on the deploy that introduces it;
* :func:`app.rbac.user_has_permission_db` falls back to it at runtime, so a role row
  written before this module existed still authorises correctly.

A ``parent`` of ``None`` means the action stands alone and must be granted explicitly.
"""

from __future__ import annotations

from typing import NamedTuple


class ActionDef(NamedTuple):
    key: str
    label: str
    parent: str | None = None


VIEW = ActionDef("view", "View")
CREATE = ActionDef("create", "Add")
EDIT = ActionDef("edit", "Edit")
DELETE = ActionDef("delete", "Delete")

CRUD: tuple[ActionDef, ...] = (VIEW, CREATE, EDIT, DELETE)

# Records that carry history — staff, clients, sites — can be archived (soft deleted)
# instead of destroyed. Archiving and restoring hang off the existing delete right, and
# permanent deletion off it too, so a role that could already delete keeps working
# exactly as before; a role that should only archive can now have the permanent one
# taken away on its own.
ARCHIVING: tuple[ActionDef, ...] = (
    ActionDef("archived_view", "View archived", "view"),
    ActionDef("archive", "Archive", "delete"),
    ActionDef("restore", "Restore archived", "delete"),
    ActionDef("delete_permanent", "Delete permanently", "delete"),
)

# Actions every module row starts with, in display order, followed by the special
# actions that module's endpoints actually implement.
MODULE_ACTIONS: dict[str, tuple[ActionDef, ...]] = {
    # --- Overview -------------------------------------------------------------------
    "dashboard": (VIEW,),
    # --- HR -------------------------------------------------------------------------
    # The job title list is Staff's own pick-list, managed from a tab on that screen, so
    # it hangs off this module rather than becoming a module (and sidebar entry) of its own.
    "guards": CRUD
    + ARCHIVING
    + (
        ActionDef("photo_upload", "Upload photo", "edit"),
        ActionDef("photo_view", "View photo", "view"),
        ActionDef("job_titles_view", "View job titles", "view"),
        ActionDef("job_titles_create", "Add job titles", "create"),
        ActionDef("job_titles_edit", "Edit job titles", "edit"),
        ActionDef("job_titles_delete", "Delete job titles", "delete"),
        ActionDef("teams_view", "View teams", "view"),
        ActionDef("teams_manage", "Manage teams", "edit"),
        ActionDef("profile_view", "View employee profile", "view"),
        ActionDef("sensitive_view", "View sensitive information", "view"),
        ActionDef("salary_view", "View salary & payroll details", "view"),
        ActionDef("terminate", "Record termination", "edit"),
    ),
    "absence": CRUD
    + (
        ActionDef("approve", "Approve or decline", "edit"),
        ActionDef("export", "Export", "view"),
    ),
    "documents": (VIEW, CREATE, DELETE)
    + (
        ActionDef("upload", "Upload files", "create"),
        ActionDef("download", "Download files", "view"),
    ),
    "contractors": CRUD
    + (
        ActionDef("deactivate", "Deactivate", "delete"),
        ActionDef("assignments_view", "View assignments", "view"),
        ActionDef("assign", "Assign to site", "edit"),
        ActionDef("unassign", "Remove assignment", "edit"),
    ),
    "sub_contractors": CRUD,
    "attendance": CRUD
    + (
        ActionDef("book", "Book attendance", "create"),
        ActionDef("book_by_shift", "Book by shift", "create"),
        ActionDef("late_view", "View late arrivals", "view"),
    ),
    "roles": CRUD
    + (
        ActionDef("users_view", "View users", "view"),
        ActionDef("users_create", "Add users", "create"),
        ActionDef("users_edit", "Edit users", "edit"),
        ActionDef("users_delete", "Delete users", "delete"),
        ActionDef("users_reset_password", "Reset user passwords", "edit"),
        ActionDef("users_assign_role", "Assign roles to users", "edit"),
        ActionDef("modules_view", "View module registry", "view"),
        ActionDef("modules_manage", "Manage module registry", "edit"),
    ),
    # --- Operations -----------------------------------------------------------------
    # No create/edit of its own: the portal screen only reads. rota_upcoming and
    # rota_previous still descend from the legacy create/edit columns, which is what
    # module_perms maps onto the portal.rota.* codes.
    "my_portal": (VIEW,)
    + (
        ActionDef("rota_current", "Current rota", "view"),
        ActionDef("rota_upcoming", "Upcoming rota", "create"),
        ActionDef("rota_previous", "Previous rota", "edit"),
        ActionDef("hours_view", "View hours", "view"),
        ActionDef("patrol_today", "Today's patrols", "view"),
        ActionDef("patrol_compliance", "Patrol compliance", "view"),
        ActionDef("incidents_view", "View incidents", "view"),
        ActionDef("incidents_create", "Report incidents", "create"),
    ),
    "sites": CRUD + ARCHIVING,
    # The /assignments API is guarded by the rota.* codes, so the shift-log and export
    # actions live on `rota` where they are actually enforced. This row drives the
    # Assignments screen and sidebar entry.
    "assignments": CRUD,
    "rota": CRUD
    + (
        ActionDef("publish", "Publish", "edit"),
        ActionDef("unpublish", "Unpublish", "edit"),
        ActionDef("unpublish_guard", "Unpublish single staff", "edit"),
        ActionDef("copy_plan", "Copy plan", "create"),
        ActionDef("export", "Export", "view"),
        ActionDef("summary_view", "View summary", "view"),
        ActionDef("detail_view", "View detail", "view"),
        ActionDef("log_overtime", "Log overtime", "edit"),
        ActionDef("log_early_finish", "Log early finish", "edit"),
        ActionDef("log_lateness", "Log lateness", "edit"),
    ),
    "rota_payable": (VIEW,),
    "patrol": CRUD
    + (
        ActionDef("checkpoint_create", "Add checkpoints", "create"),
        ActionDef("checkpoint_edit", "Edit checkpoints", "edit"),
        ActionDef("checkpoint_delete", "Delete checkpoints", "delete"),
        ActionDef("qr_generate", "Generate QR codes", "edit"),
        ActionDef("session_start", "Start patrol session", "edit"),
        ActionDef("scan", "Scan checkpoints", "edit"),
        ActionDef("scan_photo", "Scan with photo", "edit"),
        ActionDef("logs_view", "View patrol logs", "view"),
        ActionDef("photo_view", "View scan photos", "view"),
        ActionDef("reports", "Patrol reports", "view"),
        ActionDef("today_view", "Today's patrols", "view"),
    ),
    # Lone worker splits into three audiences: the worker on the mobile app
    # (session_start / check_in / sos), the controller watching the board (monitor /
    # respond / resolve) and the admin who writes the rules (policy_*).
    "lone_worker": CRUD
    + (
        ActionDef("policy_view", "View check call rules", "view"),
        ActionDef("policy_manage", "Manage check call rules", "edit"),
        ActionDef("session_start", "Start / end lone working", "create"),
        ActionDef("check_in", "Confirm safe (check call)", "create"),
        ActionDef("sos", "Raise SOS / assistance", "create"),
        ActionDef("monitor", "Monitor lone workers", "view"),
        ActionDef("respond", "Acknowledge and escalate", "edit"),
        ActionDef("resolve", "Resolve lone worker incidents", "edit"),
        ActionDef("audit_view", "Lone worker audit log", "view"),
    ),
    "incidents": CRUD
    + (
        ActionDef("create_with_images", "Report with images", "create"),
        ActionDef("status_change", "Change status", "edit"),
        ActionDef("attachments_view", "View attachments", "view"),
        ActionDef("reports", "Incident reports", "view"),
        ActionDef("summary_report", "Incident reports summary", "view"),
    ),
    # The accident log is HSE paperwork, not an operational incident — separate module so
    # a role can report incidents without seeing injury records, and vice versa.
    "accident_reports": CRUD
    + (
        ActionDef("status_change", "Change status", "edit"),
        ActionDef("pdf_download", "Download PDF", "view"),
        ActionDef("blank_form", "Print blank form", "view"),
    ),
    "occurrence_sheets": CRUD
    + (
        ActionDef("status_change", "Change status", "edit"),
        ActionDef("pdf_download", "Download PDF", "view"),
        ActionDef("blank_form", "Print blank form", "view"),
    ),
    # `complete` is separate from `edit` on purpose: the assignee ticks their own work
    # off without holding the right to rewrite or reassign what they were given.
    "tasks": CRUD
    + (
        ActionDef("assign", "Assign to employee", "edit"),
        ActionDef("complete", "Mark complete", "view"),
    ),
    # Raising a staff request is a client-portal capability — that is the module the
    # POST endpoints are guarded by — while approving one belongs to staff_requests.
    "client_portal": CRUD + (ActionDef("bulk_create", "Bulk staff request", "create"),),
    # Raising a request is client_portal.create; this module covers reviewing them.
    "staff_requests": (VIEW, ActionDef("approve", "Approve", "edit"), ActionDef("reject", "Reject", "edit")),
    # --- Sales ----------------------------------------------------------------------
    "clients": CRUD
    + ARCHIVING
    + (
        ActionDef("renew", "Renew contract", "edit"),
        ActionDef("renewals_view", "View renewals", "view"),
    ),
    "leads": CRUD
    + (
        ActionDef("assign", "Assign owner", "edit"),
        ActionDef("status_change", "Change status", "edit"),
        ActionDef("convert", "Convert to client", "edit"),
        ActionDef("export", "Export", "view"),
        ActionDef("reports", "Lead reports", "view"),
        ActionDef("audit_view", "View audit trail", "view"),
        ActionDef("notes_create", "Add notes", "edit"),
        ActionDef("followup_create", "Schedule follow-ups", "edit"),
        ActionDef("followup_complete", "Complete follow-ups", "edit"),
        ActionDef("communications_log", "Log communications", "edit"),
        ActionDef("quotation_create", "Create quotations", "edit"),
        ActionDef("document_upload", "Upload documents", "edit"),
        ActionDef("document_download", "Download documents", "view"),
        ActionDef("statuses_view", "View custom statuses", "view"),
        ActionDef("statuses_manage", "Manage custom statuses", "edit"),
        ActionDef("presets_manage", "Manage filter presets", "view"),
        ActionDef("duplicate_check", "Check duplicates", "view"),
    ),
    # --- Finance --------------------------------------------------------------------
    "payroll": CRUD
    + (
        ActionDef("calculate", "Calculate", "edit"),
        ActionDef("calculate_batch", "Batch calculate", "edit"),
    ),
    "invoices": CRUD
    + (
        ActionDef("generate", "Generate from rota", "create"),
        ActionDef("duplicate", "Duplicate", "create"),
        ActionDef("status_change", "Change status", "edit"),
        ActionDef("send", "Send to client", "edit"),
        ActionDef("pdf_download", "Download PDF", "view"),
        ActionDef("audit_view", "View audit trail", "view"),
        ActionDef("line_create", "Add lines", "edit"),
        ActionDef("line_edit", "Edit lines", "edit"),
        ActionDef("line_delete", "Delete lines", "edit"),
    ),
    "payments": CRUD,
    "expenses": CRUD
    + (
        ActionDef("document_upload", "Attach receipts", "edit"),
        ActionDef("document_download", "Download receipts", "view"),
        ActionDef("document_delete", "Remove receipts", "edit"),
        ActionDef("reports", "Expense reports", "view"),
        ActionDef("vat_report", "VAT report", "view"),
        ActionDef("dashboard_view", "Expense dashboard", "view"),
    ),
    # special_days.py is guarded by the allowances module, so its seeding action lives
    # here rather than on the special_days page row.
    "allowances": CRUD + (ActionDef("seed_uk", "Seed UK bank holidays", "create"),),
    # --- Reports --------------------------------------------------------------------
    "reports": (VIEW,)
    + (
        ActionDef("export", "Export reports", "view"),
        ActionDef("compliance_view", "Compliance alerts", "view"),
        ActionDef("contracts_expiring_view", "Expiring contracts", "view"),
        ActionDef("staff_reports", "Staff reports", "view"),
        ActionDef("attendance_reports", "Attendance reports", "view"),
        ActionDef("shift_variance_reports", "Overtime & lateness reports", "view"),
        ActionDef("shift_history_reports", "Shift history audit log", "view"),
        ActionDef("financial_reports", "Financial reports", "view"),
        ActionDef("subscription_reports", "Subscription reports", "view"),
        ActionDef("usage_reports", "Usage reports", "view"),
    ),
    # --- Settings -------------------------------------------------------------------
    # `company` is the pay/charge rate module: rates.py is the only router guarded by it.
    # The company profile screen itself is guarded by `billing`.
    "company": (VIEW, EDIT, DELETE)
    + (
        ActionDef("guard_rates_view", "View staff pay rates", "view"),
        ActionDef("guard_rates_manage", "Set staff pay rates", "edit"),
        ActionDef("guard_rates_delete", "Delete staff pay rates", "delete"),
        ActionDef("site_rates_view", "View site charge rates", "view"),
        ActionDef("site_rates_manage", "Set site charge rates", "edit"),
        ActionDef("site_rates_delete", "Delete site charge rates", "delete"),
    ),
    "billing": (VIEW, EDIT)
    + (
        ActionDef("profile_edit", "Edit company profile", "edit"),
        ActionDef("logo_upload", "Upload company logo", "edit"),
        ActionDef("receipts_view", "View receipts", "view"),
        # No `checkout` action: POST /stripe/checkout-session is part of the
        # unauthenticated signup flow, so no role can gate it.
        ActionDef("change_plan", "Change plan", "edit"),
        ActionDef("cancel", "Cancel subscription", "edit"),
        ActionDef("reactivate", "Reactivate subscription", "edit"),
        ActionDef("stripe_portal", "Open Stripe portal", "edit"),
        ActionDef("connect_account", "Connect payout account", "edit"),
    ),
    "special_days": (VIEW, CREATE, DELETE),
    "sms": (VIEW, EDIT)
    + (
        ActionDef("send", "Send SMS", "edit"),
        ActionDef("logs_view", "View SMS logs", "view"),
    ),
    "email_settings": (VIEW, EDIT)
    + (
        ActionDef("send", "Send email", "edit"),
        ActionDef("test", "Send test email", "edit"),
        ActionDef("logs_view", "View email logs", "view"),
    ),
}

# Modules created at runtime through the module registry API have no catalogue entry.
DEFAULT_ACTIONS: tuple[ActionDef, ...] = CRUD

# The four columns kept on role_module_permissions for the legacy code expansion.
LEGACY_ACTIONS: tuple[str, ...] = ("view", "create", "edit", "delete")


def actions_for_module(module_key: str) -> tuple[ActionDef, ...]:
    return MODULE_ACTIONS.get(module_key, DEFAULT_ACTIONS)


def action_keys_for_module(module_key: str) -> tuple[str, ...]:
    return tuple(a.key for a in actions_for_module(module_key))


def module_has_action(module_key: str, action: str) -> bool:
    return action in action_keys_for_module(module_key)


def parent_action(module_key: str, action: str) -> str | None:
    for a in actions_for_module(module_key):
        if a.key == action:
            return a.parent
    return None


def parent_chain(module_key: str, action: str) -> list[str]:
    """Action's ancestors, nearest first. Guards against a cyclic catalogue entry."""
    out: list[str] = []
    seen = {action}
    cur = parent_action(module_key, action)
    while cur and cur not in seen:
        out.append(cur)
        seen.add(cur)
        cur = parent_action(module_key, cur)
    return out


def all_action_codes() -> frozenset[str]:
    return frozenset(
        f"{key}.{a.key}" for key, actions in MODULE_ACTIONS.items() for a in actions
    )


def catalogue() -> dict[str, list[dict[str, str | None]]]:
    """Serialisable catalogue for the Roles & Permissions UI."""
    return {
        key: [{"key": a.key, "label": a.label, "parent": a.parent} for a in actions]
        for key, actions in MODULE_ACTIONS.items()
    }
