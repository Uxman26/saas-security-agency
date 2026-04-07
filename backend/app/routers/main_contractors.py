from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import MainContractorCreate, MainContractorResponse
from app.rbac import require_perm, PERM_SUBS_READ, PERM_SUBS_WRITE, PERM_SUBS_DELETE
from app.services import main_contractor_service

router = APIRouter(prefix="/main-contractors", tags=["main-contractors"])


@router.post("", response_model=MainContractorResponse, status_code=status.HTTP_201_CREATED)
def create_main_contractor(
    body: MainContractorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_SUBS_WRITE)),
):
    return main_contractor_service.create_main_contractor(db, body, current_user.id)


@router.get("", response_model=list[MainContractorResponse])
def list_main_contractors(db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_SUBS_READ))):
    return main_contractor_service.get_main_contractors(db, current_user.id)


@router.get("/{main_id}", response_model=MainContractorResponse)
def get_main_contractor(main_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_SUBS_READ))):
    return main_contractor_service.get_main_contractor_by_id(db, main_id, current_user.id)


@router.put("/{main_id}", response_model=MainContractorResponse)
def update_main_contractor(
    main_id: int,
    body: MainContractorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_SUBS_WRITE)),
):
    return main_contractor_service.update_main_contractor(db, main_id, body, current_user.id)


@router.delete("/{main_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_main_contractor(main_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_SUBS_DELETE))):
    main_contractor_service.delete_main_contractor(db, main_id, current_user.id)
    return None
