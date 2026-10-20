"""Public Company ID used at login.

This is a human-enterable tenant code stored in ``companies.login_id``. It is **not**
``companies.id``. Existing tenants numbered 1, 2, 3, … keep those integers as internal
primary keys and foreign keys. Login uses the separate stable ``login_id``.

Super administrators sign in without a Company ID. The reserved value
``PLATFORM`` remains accepted for compatibility.
"""

from __future__ import annotations

import secrets
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Company

PLATFORM_LOGIN_ID = "PLATFORM"
LOGIN_FAILED_DETAIL = "The Company ID, email or password is incorrect."
# Exclude 0/O/1/I so the code is easy to read and type.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_PREFIX = "CO"
_ASSIGN_ATTEMPTS = 32


def normalize_login_id(value: str | None) -> str:
    raw = (value or "").strip().upper()
    return "".join(ch for ch in raw if ch.isalnum())


def is_platform_login_id(value: str | None) -> bool:
    return normalize_login_id(value) == PLATFORM_LOGIN_ID


def is_usable_login_id(value: str | None) -> bool:
    """A stored code is usable when it is not empty, not PLATFORM, and not a bare integer PK."""
    code = normalize_login_id(value)
    if not code or code == PLATFORM_LOGIN_ID:
        return False
    if code.isdigit():
        return False
    return True


def _random_login_id() -> str:
    body = "".join(secrets.choice(_ALPHABET) for _ in range(8))
    return f"{_PREFIX}{body}"


def _login_id_taken(db: Session, candidate: str, *, exclude_company_id: int | None = None) -> bool:
    q = db.query(Company.id).filter(Company.login_id == candidate)
    if exclude_company_id is not None:
        q = q.filter(Company.id != exclude_company_id)
    return q.first() is not None


def generate_unique_login_id(db: Session, *, exclude_company_id: int | None = None) -> str:
    for _ in range(_ASSIGN_ATTEMPTS):
        candidate = _random_login_id()
        if candidate == PLATFORM_LOGIN_ID or candidate.isdigit():
            continue
        if not _login_id_taken(db, candidate, exclude_company_id=exclude_company_id):
            return candidate
    raise RuntimeError("Could not allocate a unique Company ID")


def ensure_company_login_id(db: Session, company: Company) -> str:
    """Return this tenant's public Company ID, assigning one only if missing.

    Never changes ``companies.id``. Never replaces a valid existing ``login_id``.
    """
    current = getattr(company, "login_id", None)
    if is_usable_login_id(current):
        normalized = normalize_login_id(current)
        if company.login_id != normalized:
            company.login_id = normalized
        return normalized

    last_error: Exception | None = None
    for _ in range(_ASSIGN_ATTEMPTS):
        candidate = generate_unique_login_id(db, exclude_company_id=company.id)
        try:
            with db.begin_nested():
                company.login_id = candidate
                db.flush()
            return candidate
        except IntegrityError as exc:
            last_error = exc
            continue
    raise RuntimeError("Could not allocate a unique Company ID") from last_error


def persist_company_login_id(db: Session, company: Company) -> str:
    """Assign a Company ID and commit if this session only needed that write."""
    before = getattr(company, "login_id", None)
    code = ensure_company_login_id(db, company)
    if before != code:
        db.commit()
        db.refresh(company)
    return code


def backfill_company_login_ids(db: Session) -> int:
    """Give every tenant a public Company ID without touching ``companies.id``.

    Tenants that already have a unique usable ``login_id`` keep it.
    """
    rows = db.query(Company).order_by(Company.id).all()
    assigned = 0
    seen: set[str] = set()
    for company in rows:
        current = normalize_login_id(getattr(company, "login_id", None))
        if is_usable_login_id(current) and current not in seen:
            if company.login_id != current:
                company.login_id = current
            seen.add(current)
            continue
        before_id = company.id
        company.login_id = None
        code = ensure_company_login_id(db, company)
        if company.id != before_id:
            raise RuntimeError("Company primary key changed during Company ID backfill")
        seen.add(code)
        assigned += 1
    if assigned:
        db.commit()
    return assigned


def resolve_login_company(db: Session, login_id: str) -> tuple[Optional[Company], bool]:
    """Return (company, is_platform). Looks up ``login_id`` only, never ``companies.id``."""
    code = normalize_login_id(login_id)
    if not code:
        return None, False
    if code == PLATFORM_LOGIN_ID:
        return None, True
    if not is_usable_login_id(code):
        return None, False
    company = db.query(Company).filter(Company.login_id == code).first()
    return company, False
