from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import User

DUPLICATE_EMAIL_MESSAGE = "This email address is already registered. Please use a different email."


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def find_user_by_email(db: Session, email: str, *, exclude_user_id: Optional[int] = None) -> User | None:
    normalized = normalize_email(email)
    if not normalized:
        return None
    q = db.query(User).filter(func.lower(User.email) == normalized)
    if exclude_user_id is not None:
        q = q.filter(User.id != exclude_user_id)
    return q.first()


def email_available(db: Session, email: str, *, exclude_user_id: Optional[int] = None) -> bool:
    return find_user_by_email(db, email, exclude_user_id=exclude_user_id) is None


def assert_email_available(db: Session, email: str, *, exclude_user_id: Optional[int] = None) -> str:
    normalized = normalize_email(email)
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valid email required")
    if find_user_by_email(db, normalized, exclude_user_id=exclude_user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=DUPLICATE_EMAIL_MESSAGE)
    return normalized
