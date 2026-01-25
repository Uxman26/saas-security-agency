from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.schemas import GuardCreate, GuardResponse
from app.auth import get_current_user
from app.services import guard_service

router = APIRouter(prefix="/guards", tags=["guards"])

@router.post("", response_model=GuardResponse, status_code=status.HTTP_201_CREATED)
def create_guard(guard: GuardCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return guard_service.create_guard(db, guard, current_user.id)

@router.get("", response_model=List[GuardResponse])
def get_guards(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return guard_service.get_guards(db, current_user.id)

@router.get("/{guard_id}", response_model=GuardResponse)
def get_guard(guard_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return guard_service.get_guard_by_id(db, guard_id, current_user.id)

@router.put("/{guard_id}", response_model=GuardResponse)
def update_guard(guard_id: int, guard: GuardCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return guard_service.update_guard(db, guard_id, guard, current_user.id)

@router.delete("/{guard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guard(guard_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    guard_service.delete_guard(db, guard_id, current_user.id)
    return None
