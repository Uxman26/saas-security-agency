from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from app.models import Client, ClientContractRenewal, Site
from app.schemas import ClientCreate, ClientRenewContract
from app.services.company_service import get_company_by_user_id


def _client_payload(c: ClientCreate) -> dict:
    return c.model_dump() if hasattr(c, "model_dump") else c.dict()


def create_client(db: Session, client: ClientCreate, user_id: int) -> Client:
    company = get_company_by_user_id(db, user_id)
    db_client = Client(**_client_payload(client), company_id=company.id)
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

def get_clients(db: Session, user_id: int) -> List[Client]:
    company = get_company_by_user_id(db, user_id)
    return db.query(Client).filter(Client.company_id == company.id).all()

def get_client_by_id(db: Session, client_id: int, user_id: int) -> Client:
    company = get_company_by_user_id(db, user_id)
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

def update_client(db: Session, client_id: int, client: ClientCreate, user_id: int) -> Client:
    company = get_company_by_user_id(db, user_id)
    db_client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
    if not db_client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    for key, value in _client_payload(client).items():
        setattr(db_client, key, value)
    
    db.commit()
    db.refresh(db_client)
    return db_client

def delete_client(db: Session, client_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    db.query(Site).filter(Site.client_id == client_id, Site.company_id == company.id).update({Site.client_id: None}, synchronize_session=False)
    db.delete(client)
    db.commit()


def renew_client_contract(db: Session, client_id: int, body: ClientRenewContract, user_id: int) -> ClientContractRenewal:
    company = get_company_by_user_id(db, user_id)
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    prev = client.contract_end_date
    if prev is not None and body.new_end_date <= prev:
        raise HTTPException(status_code=400, detail="New end date must be after the current contract end date")
    renewal = ClientContractRenewal(
        company_id=company.id,
        client_id=client.id,
        previous_end_date=prev,
        new_end_date=body.new_end_date,
        note=body.note,
        user_id=user_id,
    )
    client.contract_end_date = body.new_end_date
    client.contract_expiry_alert_sent_date = None
    db.add(renewal)
    db.commit()
    db.refresh(renewal)
    return renewal


def list_client_renewals(db: Session, client_id: int, user_id: int) -> List[ClientContractRenewal]:
    get_client_by_id(db, client_id, user_id)
    return (
        db.query(ClientContractRenewal)
        .filter(ClientContractRenewal.client_id == client_id)
        .order_by(ClientContractRenewal.created_at.desc())
        .all()
    )
