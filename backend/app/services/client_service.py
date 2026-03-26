from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from app.models import Client
from app.schemas import ClientCreate
from app.services.company_service import get_company_by_user_id

def create_client(db: Session, client: ClientCreate, user_id: int) -> Client:
    company = get_company_by_user_id(db, user_id)
    db_client = Client(**client.dict(), company_id=company.id)
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
    
    for key, value in client.dict().items():
        setattr(db_client, key, value)
    
    db.commit()
    db.refresh(db_client)
    return db_client

def delete_client(db: Session, client_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    db.delete(client)
    db.commit()
