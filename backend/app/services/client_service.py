from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from app.models import Client, ClientContractRenewal, Site
from app.schemas import ClientCreate, ClientRenewContract
from app.services.company_service import get_company_by_user_id


# Carried on ClientCreate to drive portal-login creation; not columns on Client, so they
# must never reach the model constructor or setattr loop.
_NON_COLUMN_FIELDS = ("create_login", "login_password")


def _client_payload(c: ClientCreate) -> dict:
    data = c.model_dump() if hasattr(c, "model_dump") else c.dict()
    for f in _NON_COLUMN_FIELDS:
        data.pop(f, None)
    return data


def create_client(db: Session, client: ClientCreate, user_id: int) -> Client:
    company = get_company_by_user_id(db, user_id)
    db_client = Client(**_client_payload(client), company_id=company.id)
    db.add(db_client)
    db.flush()  # assign db_client.id without committing, so the login can be linked below

    if getattr(client, "create_login", False):
        _create_client_login(db, db_client, company.id, client)

    db.commit()
    db.refresh(db_client)
    return db_client


def _create_client_login(db: Session, db_client: Client, company_id: int, data: ClientCreate) -> None:
    """Create the Client-role portal user for a freshly inserted client.

    Every validation below (and inside create_company_user: quota, duplicate email, role
    checks) raises before that function commits, so a rejected login leaves the flushed
    client row uncommitted and the request rolls back both together — no orphan client.
    """
    from app.schemas import CompanyUserCreate
    from app.services import role_service, user_service

    email = (data.email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required to create a portal login")
    if not data.login_password:
        raise HTTPException(status_code=400, detail="Password is required to create a portal login")

    role = role_service.get_role_by_slug(db, company_id, "client")
    if not role:
        role_service.ensure_roles_for_company(db, company_id)
        role = role_service.get_role_by_slug(db, company_id, "client")
    if not role:
        raise HTTPException(status_code=500, detail="Client role is not configured for this company")

    user_service.create_company_user(
        db,
        company_id,
        CompanyUserCreate(
            email=email,
            password=data.login_password,
            full_name=(data.contact_person or "").strip() or db_client.name,
            role_id=role.id,
            client_id=db_client.id,
        ),
    )

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
