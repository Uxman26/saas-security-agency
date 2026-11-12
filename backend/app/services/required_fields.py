"""Business-required fields on Staff (phone), Client (email) and Site (postcode).

These are enforced at the API rather than as NOT NULL columns because many existing
rows predate the rule. New records must supply the value; an edit may leave a
still-missing legacy value blank, but may not clear one that is already set.
"""
from typing import Any, Optional

from fastapi import HTTPException, status


def _blank(value: Any) -> bool:
    return value is None or not str(value).strip()


def require_on_create(value: Any, label: str) -> None:
    if _blank(value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} is required.",
        )


def require_on_update(new_value: Any, existing_value: Optional[Any], label: str) -> None:
    if _blank(new_value) and not _blank(existing_value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} is required and cannot be removed.",
        )
