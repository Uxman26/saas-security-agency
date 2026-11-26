"""Incident categories and the emergency services flags that sit alongside them.

The order here is the column order of the Incident Reports Summary, so it matches the
sheet the client already receives on paper. Categories are stored by ``key``; the label
is presentation only, which means a label can be reworded without rewriting stored rows.

Codes 01–10 mirror the paper Daily / Incident type checklist. Extra operational
categories stay available for digital reporting beyond the paper sheet.
"""

from __future__ import annotations

from typing import NamedTuple


class Category(NamedTuple):
    key: str
    label: str


INCIDENT_CATEGORIES: tuple[Category, ...] = (
    Category("smoking", "Code 01 - Smoking in room"),
    Category("drugs", "Code 02 - Drug usage in room"),
    Category("aggression", "Code 03 - Aggressive/Threatening behaviour"),
    Category("guest_door_open", "Code 04 - Guest Door Open"),
    Category("private_door_open", "Code 05 - Non Public Access Doors"),
    Category("drunk_disorderly", "Code 06 - Drunk, disorderly guests/Room disturbance"),
    Category("grounds", "Code 07 - Grounds (Youths loitering, Car Park, Vagrants)"),
    Category("prostitution", "Code 08 - Prostitution"),
    Category("eviction", "Code 09 - Eviction"),
    Category("other", "Code 10 - Other (Please specify)"),
    # Additional digital-only categories (kept for existing matrix/report columns).
    Category("overcrowding", "Overcrowding"),
    Category("loud_noise", "Loud Noise"),
    Category("homeless", "Homeless"),
    Category("temp_fire_equip", "Temp/Fire Equip"),
    Category("other_health_safety", "Other Health and Safety"),
    Category("fire", "Fire"),
)

# Anything unrecognised — an older row, or a category retired from the list — is counted
# under this rather than dropped, so a total never silently disagrees with the row count.
FALLBACK_CATEGORY = "other"

CATEGORY_KEYS: tuple[str, ...] = tuple(c.key for c in INCIDENT_CATEGORIES)
CATEGORY_LABELS: dict[str, str] = {c.key: c.label for c in INCIDENT_CATEGORIES}

# The three "was anyone called out" columns. Stored as their own booleans rather than as
# categories: an incident has exactly one category but can call all three services.
SERVICE_FLAGS: tuple[Category, ...] = (
    Category("police_called", "Police Informed"),
    Category("ambulance_called", "Ambulance Informed"),
    Category("fire_brigade_called", "Fire Services Informed"),
)

SERVICE_KEYS: tuple[str, ...] = tuple(s.key for s in SERVICE_FLAGS)


def normalize_category(value: str | None) -> str:
    key = (value or "").strip().lower().replace(" ", "_").replace("/", "_")
    # Accept legacy paper-style keys / numeric codes.
    aliases = {
        "code_01": "smoking",
        "code_02": "drugs",
        "code_03": "aggression",
        "code_04": "guest_door_open",
        "code_05": "private_door_open",
        "code_06": "drunk_disorderly",
        "code_07": "grounds",
        "code_08": "prostitution",
        "code_09": "eviction",
        "code_10": "other",
        "01": "smoking",
        "02": "drugs",
        "03": "aggression",
        "04": "guest_door_open",
        "05": "private_door_open",
        "06": "drunk_disorderly",
        "07": "grounds",
        "08": "prostitution",
        "09": "eviction",
        "10": "other",
    }
    key = aliases.get(key, key)
    return key if key in CATEGORY_LABELS else FALLBACK_CATEGORY


def category_label(value: str | None) -> str:
    return CATEGORY_LABELS.get(normalize_category(value), "Code 10 - Other (Please specify)")


def catalogue() -> dict[str, list[dict[str, str]]]:
    """Serialisable catalogue for the incident form and the summary report header."""
    return {
        "categories": [{"key": c.key, "label": c.label} for c in INCIDENT_CATEGORIES],
        "services": [{"key": s.key, "label": s.label} for s in SERVICE_FLAGS],
    }
