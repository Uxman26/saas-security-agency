from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Client, ClientBankAccount
from app.services.company_service import get_company_by_user_id


def _client(db: Session, client_id: int, company_id: int) -> Client:
    row = db.query(Client).filter(Client.id == client_id, Client.company_id == company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    return row


def list_accounts(db: Session, client_id: int, user_id: int) -> list[ClientBankAccount]:
    company = get_company_by_user_id(db, user_id)
    _client(db, client_id, company.id)
    return (
        db.query(ClientBankAccount)
        .filter(ClientBankAccount.client_id == client_id, ClientBankAccount.company_id == company.id)
        .order_by(ClientBankAccount.is_default.desc(), ClientBankAccount.id)
        .all()
    )


def get_default_account(db: Session, client_id: int, company_id: int) -> Optional[ClientBankAccount]:
    return (
        db.query(ClientBankAccount)
        .filter(
            ClientBankAccount.client_id == client_id,
            ClientBankAccount.company_id == company_id,
            ClientBankAccount.is_default == True,
        )
        .first()
    )


def _clear_defaults(db: Session, client_id: int, company_id: int, except_id: int | None = None) -> None:
    q = db.query(ClientBankAccount).filter(
        ClientBankAccount.client_id == client_id,
        ClientBankAccount.company_id == company_id,
        ClientBankAccount.is_default == True,
    )
    if except_id:
        q = q.filter(ClientBankAccount.id != except_id)
    for row in q.all():
        row.is_default = False


def create_account(db: Session, client_id: int, data: dict, user_id: int) -> ClientBankAccount:
    company = get_company_by_user_id(db, user_id)
    _client(db, client_id, company.id)
    existing = list_accounts(db, client_id, user_id)
    make_default = bool(data.get("is_default")) or len(existing) == 0
    if make_default:
        _clear_defaults(db, client_id, company.id)
    row = ClientBankAccount(
        company_id=company.id,
        client_id=client_id,
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
    db.commit()
    db.refresh(row)
    return row


def update_account(db: Session, client_id: int, account_id: int, data: dict, user_id: int) -> ClientBankAccount:
    company = get_company_by_user_id(db, user_id)
    _client(db, client_id, company.id)
    row = (
        db.query(ClientBankAccount)
        .filter(
            ClientBankAccount.id == account_id,
            ClientBankAccount.client_id == client_id,
            ClientBankAccount.company_id == company.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Bank account not found")
    for key in ("label", "account_name", "bank_name", "sort_code", "account_number", "iban", "swift_code"):
        if key in data and data[key] is not None:
            val = str(data[key]).strip()
            setattr(row, key, val or None)
    if data.get("is_default") is True:
        _clear_defaults(db, client_id, company.id, except_id=row.id)
        row.is_default = True
    elif data.get("is_default") is False and row.is_default:
        others = (
            db.query(ClientBankAccount)
            .filter(
                ClientBankAccount.client_id == client_id,
                ClientBankAccount.company_id == company.id,
                ClientBankAccount.id != row.id,
            )
            .first()
        )
        if others:
            row.is_default = False
            others.is_default = True
    db.commit()
    db.refresh(row)
    return row


def delete_account(db: Session, client_id: int, account_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    _client(db, client_id, company.id)
    row = (
        db.query(ClientBankAccount)
        .filter(
            ClientBankAccount.id == account_id,
            ClientBankAccount.client_id == client_id,
            ClientBankAccount.company_id == company.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Bank account not found")
    was_default = row.is_default
    db.delete(row)
    db.flush()
    if was_default:
        nxt = (
            db.query(ClientBankAccount)
            .filter(ClientBankAccount.client_id == client_id, ClientBankAccount.company_id == company.id)
            .order_by(ClientBankAccount.id)
            .first()
        )
        if nxt:
            nxt.is_default = True
    db.commit()


def set_default(db: Session, client_id: int, account_id: int, user_id: int) -> ClientBankAccount:
    return update_account(db, client_id, account_id, {"is_default": True}, user_id)


def apply_account_to_invoice(db: Session, inv, account: Optional[ClientBankAccount] = None, company=None) -> None:
    if account:
        inv.client_bank_account_id = account.id
        inv.payee_account_name = account.account_name
        inv.payee_bank_name = account.bank_name
        inv.payee_sort_code = account.sort_code
        inv.payee_account_number = account.account_number
        inv.payee_iban = account.iban
        inv.payee_swift_code = account.swift_code
        return
    if company:
        inv.client_bank_account_id = None
        inv.payee_account_name = company.account_name
        inv.payee_bank_name = company.bank_name
        inv.payee_sort_code = company.sort_code
        inv.payee_account_number = company.account_number
        inv.payee_iban = company.iban
        inv.payee_swift_code = company.swift_code
