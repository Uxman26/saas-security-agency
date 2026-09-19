"""The catalogue of everything a subscription package can include.

Package features come in two shapes and the split matters:

* ``capability`` — a switch inside a screen the tenant already has (extended reports,
  sub-contractor records). Nothing appears or disappears in the nav.
* ``app`` — a whole module the tenant either has or does not (lead capture, landing
  pages, the barcode generator). These keys are mirrored onto the company's
  ``enabled_modules_json`` by ``module_service.apply_plan_module_flags``, so granting
  one on a plan is what actually puts the app in the tenant's hands.

Super admins may add their own keys on top of this list; those are stored in
platform_plans.json and merged in by ``platform_plans_service.list_features``.
"""

from __future__ import annotations

from typing import Any

GROUP_ORDER = ("core", "apps", "comms", "limits_support")

GROUP_LABELS = {
    "core": "Core capabilities",
    "apps": "Apps & add-ons",
    "comms": "Communications",
    "limits_support": "Service level",
}

# key, label, description, group, tenant_module
# `tenant_module` is the enabled_modules_json key this feature drives, when it drives
# one. None means the feature is read straight off the plan instead.
CATALOG: tuple[tuple[str, str, str, str, str | None], ...] = (
    ("extended_reports", "Extended reports", "Full reporting hub beyond the standard summaries", "core", None),
    ("contractors", "Contractors", "Main contractor onboarding and records", "core", None),
    ("sub_contractors", "Sub-contractors", "Sub-contractor records and assignment", "core", None),
    ("subcontractors", "Sub-contractor assignment", "Assign work out to sub-contractors", "core", None),
    ("expenses", "Expenses", "Staff expense claims and approval", "core", "expenses"),
    ("leads", "Lead management", "Lead pipeline, follow-ups and meetings", "apps", "leads"),
    ("lead_capture", "Lead capture", "Public capture forms and inbound lead routing", "apps", "lead_capture"),
    ("landing_pages", "Landing pages", "Hosted landing pages for campaigns and sign-ups", "apps", "landing_pages"),
    ("barcode_generator", "Barcode generator", "Generate and print barcodes / QR tags for sites and assets", "apps", "barcode_generator"),
    ("mobile_apps", "Mobile apps", "Staff mobile clock-in and patrol apps", "apps", "mobile_apps"),
    ("client_portal", "Client portal", "Client logins for sites, requests and reports", "apps", "client_portal"),
    ("api_access", "API access", "REST API tokens for third-party integrations", "apps", "api_access"),
    ("email", "Email", "Transactional and bulk email from the platform", "comms", "email"),
    ("sms", "SMS / WhatsApp", "Twilio SMS and WhatsApp messaging", "comms", "whatsapp"),
    ("priority_support", "Priority support", "Faster response targets and a named contact", "limits_support", None),
)

CATALOG_KEYS: tuple[str, ...] = tuple(row[0] for row in CATALOG)

# Feature key -> enabled_modules_json key, for the plan → tenant mirror.
FEATURE_TO_MODULE: dict[str, str] = {row[0]: row[4] for row in CATALOG if row[4]}


def catalog_entries() -> list[dict[str, Any]]:
    return [
        {"key": k, "label": label, "description": desc, "group": group, "tenant_module": mod, "custom": False}
        for k, label, desc, group, mod in CATALOG
    ]


def label_for(key: str) -> str:
    for k, label, _desc, _group, _mod in CATALOG:
        if k == key:
            return label
    return key.replace("_", " ").capitalize()
