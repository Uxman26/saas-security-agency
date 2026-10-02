from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Company, CompanyBankAccount
from app.services.company_service import get_company_by_user_id


def list_accounts(db: Session, user_id: int) -> list[CompanyBankAccount]:
    company = get_company_by_user_id(db, user_id)
    return (
        db.query(CompanyBankAccount)
        .filter(CompanyBankAccount.company_id == company.id)
        .order_by(CompanyBankAccount.is_default.desc(), CompanyBankAccount.id)
        .all()
    )


def get_default_account(db: Session, company_id: int) -> Optional[CompanyBankAccount]:
    return (
        db.query(CompanyBankAccount)
        .filter(CompanyBankAccount.company_id == company_id, CompanyBankAccount.is_default == True)
        .first()
    )


def _clear_defaults(db: Session, company_id: int, except_id: int | None = None) -> None:
    q = db.query(CompanyBankAccount).filter(
        CompanyBankAccount.company_id == company_id,
        CompanyBankAccount.is_default == True,
    )
    if except_id:
        q = q.filter(CompanyBankAccount.id != except_id)
    for row in q.all():
        row.is_default = False


def _sync_company_legacy_fields(db: Session, company: Company, account: Optional[CompanyBankAccount]) -> None:
    if not account:
        return
    company.account_name = account.account_name
    company.bank_name = account.bank_name
    company.sort_code = account.sort_code
    company.account_number = account.account_number
    company.iban = account.iban
    company.swift_code = account.swift_code


def create_account(db: Session, data: dict, user_id: int) -> CompanyBankAccount:
    company = get_company_by_user_id(db, user_id)
    existing = list_accounts(db, user_id)
    make_default = bool(data.get("is_default")) or len(existing) == 0
    if make_default:
        _clear_defaults(db, company.id)
    row = CompanyBankAccount(
        company_id=company.id,
        label=(data.get("label") or "Primary").strip() or "Primary",
        account_name=(data.get("account_name") or "").strip() or None,
        bank_name=(data.get("bank_name") or "").strip() or None,
        sort_code=(data.get("sort_code") or "").strip() or None,
        account_number=(data.get("account_number") or "").strip() or None,
        iban=(data.get("iban") or "").strip() or None,
        swift_code=(data.get("swift_code") or "").strip() or None,
        is_default=make_default,
    )
    db.add(row)
    if make_default:
        _sync_company_legacy_fields(db, company, row)
    db.commit()
    db.refresh(row)
    return row


def update_account(db: Session, account_id: int, data: dict, user_id: int) -> CompanyBankAccount:
    company = get_company_by_user_id(db, user_id)
    row = (
        db.query(CompanyBankAccount)
        .filter(CompanyBankAccount.id == account_id, CompanyBankAccount.company_id == company.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Bank account not found")
    for key in ("label", "account_name", "bank_name", "sort_code", "account_number", "iban", "swift_code"):
        if key in data and data[key] is not None:
            val = str(data[key]).strip() if data[key] is not None else ""
            setattr(row, key, val or (None if key != "label" else "Primary"))
    if data.get("is_default"):
        _clear_defaults(db, company.id, except_id=row.id)
        row.is_default = True
        _sync_company_legacy_fields(db, company, row)
    elif row.is_default:
        _sync_company_legacy_fields(db, company, row)
    db.commit()
    db.refresh(row)
    return row


def set_default(db: Session, account_id: int, user_id: int) -> CompanyBankAccount:
    company = get_company_by_user_id(db, user_id)
    row = (
        db.query(CompanyBankAccount)
        .filter(CompanyBankAccount.id == account_id, CompanyBankAccount.company_id == company.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Bank account not found")
    _clear_defaults(db, company.id, except_id=row.id)
    row.is_default = True
    _sync_company_legacy_fields(db, company, row)
    db.commit()
    db.refresh(row)
    return row


def delete_account(db: Session, account_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    row = (
        db.query(CompanyBankAccount)
        .filter(CompanyBankAccount.id == account_id, CompanyBankAccount.company_id == company.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Bank account not found")
    was_default = row.is_default
    db.delete(row)
    db.flush()
    if was_default:
        nxt = (
            db.query(CompanyBankAccount)
            .filter(CompanyBankAccount.company_id == company.id)
            .order_by(CompanyBankAccount.id)
            .first()
        )
        if nxt:
            nxt.is_default = True
            _sync_company_legacy_fields(db, company, nxt)
        else:
            company.account_name = None
            company.bank_name = None
            company.sort_code = None
            company.account_number = None
            company.iban = None
            company.swift_code = None
    db.commit()


def ensure_seeded_from_legacy(db: Session, company: Company) -> None:
    existing = (
        db.query(CompanyBankAccount)
        .filter(CompanyBankAccount.company_id == company.id)
        .count()
    )
    if existing:
        return
    has_any = any(
        [
            (company.account_name or "").strip(),
            (company.bank_name or "").strip(),
            (company.sort_code or "").strip(),
            (company.account_number or "").strip(),
            (company.iban or "").strip(),
            (company.swift_code or "").strip(),
        ]
    )
    if not has_any:
        return
    row = CompanyBankAccount(
        company_id=company.id,
        label="Primary",
        account_name=company.account_name,
        bank_name=company.bank_name,
        sort_code=company.sort_code,
        account_number=company.account_number,
        iban=company.iban,
        swift_code=company.swift_code,
        is_default=True,
    )
    db.add(row)
    db.commit()
