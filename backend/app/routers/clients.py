from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import ClientCreate, ClientResponse
from app.rbac import require_perm, PERM_CLIENTS_READ, PERM_CLIENTS_WRITE, PERM_CLIENTS_DELETE
from app.services import client_service

router = APIRouter(prefix="/clients", tags=["clients"])

@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(client: ClientCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_CLIENTS_WRITE))):
    return client_service.create_client(db, client, current_user.id)

@router.get("", response_model=list[ClientResponse])
def get_clients(db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_CLIENTS_READ))):
    return client_service.get_clients(db, current_user.id)

@router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_CLIENTS_READ))):
    return client_service.get_client_by_id(db, client_id, current_user.id)

@router.put("/{client_id}", response_model=ClientResponse)
def update_client(client_id: int, client: ClientCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_CLIENTS_WRITE))):
    return client_service.update_client(db, client_id, client, current_user.id)

@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_CLIENTS_DELETE))):
    client_service.delete_client(db, client_id, current_user.id)
    return None
