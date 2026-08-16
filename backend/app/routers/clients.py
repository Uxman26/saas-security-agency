from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import (
    ClientCreate,
    ClientResponse,
    ClientRenewContract,
    ClientContractRenewalResponse,
    CompanyUserResetPassword,
    PortalLoginOut,
)
from app.rbac import require_internal_module
from app.services import client_service
from app.services.portal_login_view import portal_login_out

router = APIRouter(prefix="/clients", tags=["clients"])

@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(client: ClientCreate, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("clients", "create"))):
    return client_service.create_client(db, client, current_user.id)

@router.get("", response_model=list[ClientResponse])
def get_clients(db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("clients", "view"))):
    return client_service.get_clients(db, current_user.id)

@router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("clients", "view"))):
    return client_service.get_client_by_id(db, client_id, current_user.id)

@router.put("/{client_id}", response_model=ClientResponse)
def update_client(client_id: int, client: ClientCreate, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("clients", "edit"))):
    # Logins are created only on the POST path. Silently ignoring the flag here would let
    # an edit look like it provisioned access when it did nothing.
    if client.create_login:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A portal login cannot be created from an edit. Use Roles & Permissions → Users.",
        )
    return client_service.update_client(db, client_id, client, current_user.id)

@router.get("/{client_id}/portal-logins", response_model=list[PortalLoginOut])
def list_client_portal_logins(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("roles", "users_view")),
):
    """Portal logins attached to this client, shown on its edit screen.

    Guarded by the user-administration right rather than clients.edit: these are company
    login accounts, so seeing them is the same permission as seeing the Users list.
    """
    return [portal_login_out(db, u) for u in client_service.list_client_portal_logins(db, client_id, current_user.id)]


@router.post("/{client_id}/portal-logins/{login_user_id}/password", response_model=PortalLoginOut)
def set_client_portal_login_password(
    client_id: int,
    login_user_id: int,
    body: CompanyUserResetPassword,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("roles", "users_reset_password")),
):
    """Change the password on one of this client's portal logins."""
    user = client_service.set_client_login_password(
        db, client_id, login_user_id, body.new_password, current_user.id
    )
    return portal_login_out(db, user)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_internal_module("clients", "delete"))):
    client_service.delete_client(db, client_id, current_user.id)
    return None


@router.post("/{client_id}/renew", response_model=ClientContractRenewalResponse)
def renew_client_contract(
    client_id: int,
    body: ClientRenewContract,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("clients", "renew")),
):
    return client_service.renew_client_contract(db, client_id, body, current_user.id)


@router.get("/{client_id}/renewals", response_model=list[ClientContractRenewalResponse])
def list_client_renewals(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("clients", "renewals_view")),
):
    return client_service.list_client_renewals(db, client_id, current_user.id)
