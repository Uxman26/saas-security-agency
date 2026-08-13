from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.schemas import AllowanceCreate, AllowanceResponse
from app.rbac import require_module
from app.services import allowance_service

router = APIRouter(prefix="/allowances", tags=["allowances"])

@router.post("", response_model=AllowanceResponse, status_code=status.HTTP_201_CREATED)
def create_allowance(data: AllowanceCreate, db: Session = Depends(get_db), current_user: User = Depends(require_module("allowances", "create"))):
    return allowance_service.create_allowance(db, data, current_user.id)

@router.get("", response_model=List[AllowanceResponse])
def list_allowances(db: Session = Depends(get_db), current_user: User = Depends(require_module("allowances", "view"))):
    return allowance_service.get_allowances(db, current_user.id)

@router.get("/{allowance_id}", response_model=AllowanceResponse)
def get_allowance(allowance_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("allowances", "view"))):
    return allowance_service.get_allowance(db, allowance_id, current_user.id)

@router.put("/{allowance_id}", response_model=AllowanceResponse)
def update_allowance(allowance_id: int, data: AllowanceCreate, db: Session = Depends(get_db), current_user: User = Depends(require_module("allowances", "edit"))):
    return allowance_service.update_allowance(db, allowance_id, data, current_user.id)

@router.delete("/{allowance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_allowance(allowance_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_module("allowances", "delete"))):
    allowance_service.delete_allowance(db, allowance_id, current_user.id)
    return None
