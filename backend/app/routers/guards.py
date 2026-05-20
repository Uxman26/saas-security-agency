from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import User
from app.schemas import GuardCreate, GuardResponse
from app.rbac import require_perm, PERM_GUARDS_READ, PERM_GUARDS_WRITE, PERM_GUARDS_DELETE
from app.services import guard_service

router = APIRouter(prefix="/guards", tags=["guards"])

@router.post("", response_model=GuardResponse, status_code=status.HTTP_201_CREATED)
def create_guard(guard: GuardCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_GUARDS_WRITE))):
    return guard_service.create_guard(db, guard, current_user.id)

@router.get("", response_model=List[GuardResponse])
def get_guards(
    area: Optional[str] = Query(None),
    postcode: Optional[str] = Query(None),
    nearby: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_GUARDS_READ)),
):
    return guard_service.get_guards(db, current_user.id, area=area, postcode=postcode, nearby=nearby)

@router.get("/{guard_id}", response_model=GuardResponse)
def get_guard(guard_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_GUARDS_READ))):
    return guard_service.get_guard_by_id(db, guard_id, current_user.id)

@router.put("/{guard_id}", response_model=GuardResponse)
def update_guard(guard_id: int, guard: GuardCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_GUARDS_WRITE))):
    return guard_service.update_guard(db, guard_id, guard, current_user.id)

@router.delete("/{guard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guard(guard_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_GUARDS_DELETE))):
    guard_service.delete_guard(db, guard_id, current_user.id)
    return None
