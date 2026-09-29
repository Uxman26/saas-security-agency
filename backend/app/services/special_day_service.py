from datetime import date
from typing import List, Set
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import SpecialDay
from app.services.company_service import get_company_by_user_id
from app.services.uk_bank_holidays import uk_england_wales_entries
from app.services.recycle_bin import archive as _bin_archive
from app.services.recycle_bin import revive_if_binned as _bin_revive


def special_date_set(db: Session, company_id: int) -> Set[date]:
    rows = db.query(SpecialDay.date).filter(SpecialDay.company_id == company_id).all()
    return {r[0] for r in rows}


def is_special_day(db: Session, company_id: int, d: date) -> bool:
    return (
        db.query(SpecialDay.id)
        .filter(SpecialDay.company_id == company_id, SpecialDay.date == d)
        .first()
        is not None
    )


def list_in_range(db: Session, user_id: int, start: date, end: date) -> List[SpecialDay]:
    company = get_company_by_user_id(db, user_id)
    return (
        db.query(SpecialDay)
        .filter(
            SpecialDay.company_id == company.id,
            SpecialDay.date >= start,
            SpecialDay.date <= end,
        )
        .order_by(SpecialDay.date)
        .all()
    )


def list_all(db: Session, user_id: int) -> List[SpecialDay]:
    company = get_company_by_user_id(db, user_id)
    return db.query(SpecialDay).filter(SpecialDay.company_id == company.id).order_by(SpecialDay.date.desc()).all()


def create_day(db: Session, user_id: int, d: date, label: str) -> SpecialDay:
    company = get_company_by_user_id(db, user_id)
    lab = (label or "").strip() or "Special day"
    existing = (
        db.query(SpecialDay).filter(SpecialDay.company_id == company.id, SpecialDay.date == d).first()
    )
    if existing:
        existing.label = lab
        db.commit()
        db.refresh(existing)
        return existing
    row = _bin_revive(db, SpecialDay, user_id, company_id=company.id, date=d)
    if row is not None:
        row.label = lab
    else:
        row = SpecialDay(company_id=company.id, date=d, label=lab)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_day(db: Session, user_id: int, day_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    row = db.query(SpecialDay).filter(SpecialDay.id == day_id, SpecialDay.company_id == company.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Special day not found")
    _bin_archive(row, user_id)
    db.commit()


def seed_uk_bank_holidays(db: Session, user_id: int, year: int) -> int:
    company = get_company_by_user_id(db, user_id)
    entries = uk_england_wales_entries(year)
    if not entries:
        raise HTTPException(status_code=400, detail="No preset holidays for this year")
    added = 0
    for d, lab in entries:
        existing = (
            db.query(SpecialDay).filter(SpecialDay.company_id == company.id, SpecialDay.date == d).first()
        )
        if existing:
            continue
        db.add(SpecialDay(company_id=company.id, date=d, label=lab))
        added += 1
    db.commit()
    return added
