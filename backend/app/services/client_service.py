from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from app.models import Client, ClientContractRenewal, Site
from app.schemas import ClientCreate, ClientRenewContract
from app.services.company_service import get_company_by_user_id
from app.services import audit_service, soft_delete


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

def list_client_portal_logins(db: Session, client_id: int, user_id: int) -> List["User"]:
    """The portal logins attached to this client, for the Portal login panel on its edit screen."""
    from app.models import User

    client = get_client_by_id(db, client_id, user_id)
    return (
        db.query(User)
        .filter(User.company_id == client.company_id, User.client_id == client.id)
        .order_by(User.email)
        .all()
    )


def set_client_login_password(db: Session, client_id: int, login_user_id: int, new_password: str, user_id: int) -> "User":
    """Set a new password on one of this client's portal logins.

    The login must already belong to this client. Checking that here — rather than
    trusting the id the screen sends — keeps the client editor from being able to reach
    any other account in the company, whatever it posts.
    """
    from app.services import user_service

    logins = {u.id for u in list_client_portal_logins(db, client_id, user_id)}
    if login_user_id not in logins:
        raise HTTPException(status_code=404, detail="Portal login not found for this client")
    company = get_company_by_user_id(db, user_id)
    return user_service.reset_company_user_password(db, company.id, login_user_id, new_password)


def get_clients(db: Session, user_id: int, view: str = soft_delete.VIEW_ACTIVE) -> List[Client]:
    """Clients. Archived ones are left out unless ``view`` asks for them."""
    company = get_company_by_user_id(db, user_id)
    return soft_delete.apply_view(
        db.query(Client).filter(Client.company_id == company.id), Client, view
    ).all()

def get_client_by_id(db: Session, client_id: int, user_id: int) -> Client:
    company = get_company_by_user_id(db, user_id)
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

def _assert_not_archived(client: Client) -> None:
    if soft_delete.is_archived(client):
        raise HTTPException(
            status_code=409,
            detail=f"“{client.name}” is archived. Restore it before making changes.",
        )


def update_client(db: Session, client_id: int, client: ClientCreate, user_id: int) -> Client:
    company = get_company_by_user_id(db, user_id)
    db_client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
    if not db_client:
        raise HTTPException(status_code=404, detail="Client not found")
    _assert_not_archived(db_client)
    
    for key, value in _client_payload(client).items():
        setattr(db_client, key, value)
    
    db.commit()
    db.refresh(db_client)
    return db_client

def _client_for_write(db: Session, client_id: int, user_id: int):
    company = get_company_by_user_id(db, user_id)
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client, company


def archive_client(db: Session, client_id: int, user_id: int) -> Client:
    """Soft delete: the client leaves the list, its invoices and history stay.

    Its sites keep pointing at it, so restoring puts the whole relationship back exactly
    as it was. Any client portal login is switched off; restoring does not switch it back
    on, which is deliberate — re-granting access should be a decision, not a side effect.
    """
    from app.models import User

    client, company = _client_for_write(db, client_id, user_id)
    if soft_delete.is_archived(client):
        return client
    logins = (
        db.query(User)
        .filter(User.company_id == company.id, User.client_id == client.id, User.is_active.is_(True))
        .update({User.is_active: False}, synchronize_session=False)
    )
    soft_delete.mark_archived(client, user_id)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="archive",
        entity_type="client",
        entity_id=client_id,
        meta={"name": client.name, "logins_disabled": logins},
    )
    db.commit()
    db.refresh(client)
    return client


def restore_client(db: Session, client_id: int, user_id: int) -> Client:
    """Bring an archived client back to the list. Portal logins stay disabled."""
    client, company = _client_for_write(db, client_id, user_id)
    if not soft_delete.is_archived(client):
        return client
    soft_delete.mark_restored(client)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="restore",
        entity_type="client",
        entity_id=client_id,
        meta={"name": client.name},
    )
    db.commit()
    db.refresh(client)
    return client


def client_delete_impact(db: Session, client_id: int, user_id: int) -> dict:
    """What a permanent delete would destroy, so the confirmation can say it out loud."""
    from app.models import ClientContractRenewal, Invoice, StaffRequest, User

    client, company = _client_for_write(db, client_id, user_id)
    sites = db.query(Site).filter(Site.client_id == client.id, Site.company_id == company.id).count()
    counts = {
        "invoices": db.query(Invoice).filter(Invoice.client_id == client.id).count(),
        "contract renewals": db.query(ClientContractRenewal)
        .filter(ClientContractRenewal.client_id == client.id)
        .count(),
        "staff requests": db.query(StaffRequest).filter(StaffRequest.client_id == client.id).count(),
        "portal logins": db.query(User).filter(User.client_id == client.id).count(),
    }
    records = [{"label": k, "count": v} for k, v in counts.items() if v]
    if sites:
        # Sites survive the delete — they are simply unlinked — so say that rather than
        # letting the count read as another thing about to be destroyed.
        records.append({"label": f"site{'s' if sites != 1 else ''} that will be left without a client", "count": sites})
    return {
        "id": client.id,
        "name": client.name,
        "archived": soft_delete.is_archived(client),
        "records": records,
        "blockers": [],
    }


def delete_client(db: Session, client_id: int, user_id: int) -> None:
    """Permanent delete: the client and its invoices, renewals and requests, irreversibly.

    Its sites are kept and unlinked — a site is a place that still exists whoever is
    paying for it, and deleting it here would take its rota history with it.
    """
    from app.models import User

    client, company = _client_for_write(db, client_id, user_id)
    impact = client_delete_impact(db, client_id, user_id)
    db.query(Site).filter(Site.client_id == client_id, Site.company_id == company.id).update(
        {Site.client_id: None}, synchronize_session=False
    )
    db.query(User).filter(User.client_id == client.id).update(
        {User.client_id: None, User.is_active: False}, synchronize_session=False
    )
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="delete",
        entity_type="client",
        entity_id=client_id,
        meta={"name": client.name, "destroyed": impact["records"]},
    )
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
