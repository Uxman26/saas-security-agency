"""Emergency contacts for a staff member.

The Guard record carries one embedded contact from before this table existed. It is
migrated across the first time a staff member's contacts are read, so nothing already
captured is lost and nobody has to re-key it — and the legacy fields are left in place so
older screens and exports keep working.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import EmergencyContact, Guard
from app.services.company_service import get_company_by_user_id

# Which legacy Guard column feeds which contact field.
_LEGACY_MAP = {
    "first_name": "emergency_first_name",
    "last_name": "emergency_last_name",
    "relationship_to_employee": "emergency_relationship",
    "mobile_phone": "emergency_mobile",
    "home_phone": "emergency_home_phone",
    "work_phone": "emergency_work_phone",
    "address_line_1": "emergency_address_line_1",
    "address_line_2": "emergency_address_line_2",
    "address_line_3": "emergency_address_line_3",
    "town_city": "emergency_town_city",
    "county": "emergency_county",
    "postcode": "emergency_postcode",
}


def _guard(db: Session, guard_id: int, company_id: int) -> Guard:
    row = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Employee not found")
    return row


def _migrate_legacy(db: Session, guard: Guard) -> bool:
    """Copy the one embedded contact into the table. Returns whether anything moved."""
    values = {field: (getattr(guard, col, None) or "").strip() for field, col in _LEGACY_MAP.items()}
    if not values.get("first_name") and not values.get("mobile_phone"):
        return False
    db.add(
        EmergencyContact(
            company_id=guard.company_id,
            guard_id=guard.id,
            is_primary=True,
            **{k: (v or None) for k, v in values.items()},
        )
    )
    return True


def list_contacts(db: Session, user_id: int, guard_id: int) -> List[EmergencyContact]:
    company = get_company_by_user_id(db, user_id)
    guard = _guard(db, guard_id, company.id)
    q = db.query(EmergencyContact).filter(
        EmergencyContact.company_id == company.id, EmergencyContact.guard_id == guard.id
    )
    if not q.first() and _migrate_legacy(db, guard):
        db.commit()
    return q.order_by(EmergencyContact.is_primary.desc(), EmergencyContact.id).all()


def _payload(data: dict) -> dict:
    out = {}
    for field in (
        "first_name",
        "last_name",
        "relationship_to_employee",
        "mobile_phone",
        "home_phone",
        "work_phone",
        "email",
        "address_line_1",
        "address_line_2",
        "address_line_3",
        "town_city",
        "county",
        "postcode",
    ):
        if field in data:
            value = data.get(field)
            out[field] = (value or "").strip() or None
    return out


def create_contact(db: Session, user_id: int, guard_id: int, data: dict) -> EmergencyContact:
    company = get_company_by_user_id(db, user_id)
    guard = _guard(db, guard_id, company.id)
    fields = _payload(data)
    if not fields.get("first_name"):
        raise HTTPException(status_code=422, detail="A first name is required")
    existing = (
        db.query(EmergencyContact)
        .filter(EmergencyContact.company_id == company.id, EmergencyContact.guard_id == guard.id)
        .count()
    )
    row = EmergencyContact(
        company_id=company.id,
        guard_id=guard.id,
        # The first contact captured is the one to ring first, unless told otherwise.
        is_primary=bool(data.get("is_primary")) or existing == 0,
        **fields,
    )
    if row.is_primary:
        _clear_other_primaries(db, company.id, guard.id, None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _clear_other_primaries(db: Session, company_id: int, guard_id: int, keep_id: Optional[int]) -> None:
    q = db.query(EmergencyContact).filter(
        EmergencyContact.company_id == company_id,
        EmergencyContact.guard_id == guard_id,
        EmergencyContact.is_primary.is_(True),
    )
    if keep_id is not None:
        q = q.filter(EmergencyContact.id != keep_id)
    q.update({EmergencyContact.is_primary: False}, synchronize_session=False)


def _contact(db: Session, company_id: int, contact_id: int) -> EmergencyContact:
    row = (
        db.query(EmergencyContact)
        .filter(EmergencyContact.id == contact_id, EmergencyContact.company_id == company_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Emergency contact not found")
    return row


def update_contact(db: Session, user_id: int, contact_id: int, data: dict) -> EmergencyContact:
    company = get_company_by_user_id(db, user_id)
    row = _contact(db, company.id, contact_id)
    for k, v in _payload(data).items():
        setattr(row, k, v)
    if not (row.first_name or "").strip():
        raise HTTPException(status_code=422, detail="A first name is required")
    if data.get("is_primary"):
        _clear_other_primaries(db, company.id, row.guard_id, row.id)
        row.is_primary = True
    db.commit()
    db.refresh(row)
    return row


def delete_contact(db: Session, user_id: int, contact_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    row = _contact(db, company.id, contact_id)
    guard_id, was_primary = row.guard_id, row.is_primary
    db.delete(row)
    db.flush()
    if was_primary:
        # Never leave a staff member with contacts but none of them primary.
        nxt = (
            db.query(EmergencyContact)
            .filter(EmergencyContact.company_id == company.id, EmergencyContact.guard_id == guard_id)
            .order_by(EmergencyContact.id)
            .first()
        )
        if nxt:
            nxt.is_primary = True
    db.commit()
