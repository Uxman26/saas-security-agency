"""Incident categories and the emergency services flags that sit alongside them.

The order here is the column order of the Incident Reports Summary, so it matches the
sheet the client already receives on paper. Categories are stored by ``key``; the label
is presentation only, which means a label can be reworded without rewriting stored rows.
"""

from __future__ import annotations

from typing import NamedTuple


class Category(NamedTuple):
    key: str
    label: str


INCIDENT_CATEGORIES: tuple[Category, ...] = (
    Category("smoking", "Smoking"),
    Category("drugs", "Drugs"),
    Category("aggression", "Aggression"),
    Category("guest_door_open", "Guest Door Open"),
    Category("private_door_open", "Private Door Open"),
    Category("drunk_disorderly", "Drunk Disorderly"),
    Category("overcrowding", "Overcrowding"),
    Category("loud_noise", "Loud Noise"),
    Category("grounds", "Grounds"),
    Category("prostitution", "Prostitution"),
    Category("eviction", "Eviction"),
    Category("homeless", "Homeless"),
    Category("temp_fire_equip", "Temp/Fire Equip"),
    Category("other_health_safety", "Other Health and Safety"),
    Category("fire", "Fire"),
    Category("other", "Other"),
)

# Anything unrecognised — an older row, or a category retired from the list — is counted
# under this rather than dropped, so a total never silently disagrees with the row count.
FALLBACK_CATEGORY = "other"

CATEGORY_KEYS: tuple[str, ...] = tuple(c.key for c in INCIDENT_CATEGORIES)
CATEGORY_LABELS: dict[str, str] = {c.key: c.label for c in INCIDENT_CATEGORIES}

# The three "was anyone called out" columns. Stored as their own booleans rather than as
# categories: an incident has exactly one category but can call all three services.
SERVICE_FLAGS: tuple[Category, ...] = (
    Category("police_called", "Police Called"),
    Category("ambulance_called", "Ambulance Called"),
    Category("fire_brigade_called", "Fire Brigade Called"),
)

SERVICE_KEYS: tuple[str, ...] = tuple(s.key for s in SERVICE_FLAGS)


def normalize_category(value: str | None) -> str:
    key = (value or "").strip().lower().replace(" ", "_").replace("/", "_")
    return key if key in CATEGORY_LABELS else FALLBACK_CATEGORY


def category_label(value: str | None) -> str:
    return CATEGORY_LABELS.get(normalize_category(value), "Other")


def catalogue() -> dict[str, list[dict[str, str]]]:
    """Serialisable catalogue for the incident form and the summary report header."""
    return {
        "categories": [{"key": c.key, "label": c.label} for c in INCIDENT_CATEGORIES],
        "services": [{"key": s.key, "label": s.label} for s in SERVICE_FLAGS],
    }
