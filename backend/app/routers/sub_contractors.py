from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import SubContractorCreate, SubContractorResponse
from app.auth import get_current_user
from app.services import sub_contractor_service

router = APIRouter(prefix="/sub-contractors", tags=["sub-contractors"])

@router.post("", response_model=SubContractorResponse, status_code=status.HTTP_201_CREATED)
def create_sub_contractor(sub_contractor: SubContractorCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return sub_contractor_service.create_sub_contractor(db, sub_contractor, current_user.id)

@router.get("", response_model=list[SubContractorResponse])
def get_sub_contractors(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return sub_contractor_service.get_sub_contractors(db, current_user.id)

@router.get("/{sub_contractor_id}", response_model=SubContractorResponse)
def get_sub_contractor(sub_contractor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return sub_contractor_service.get_sub_contractor_by_id(db, sub_contractor_id, current_user.id)

@router.put("/{sub_contractor_id}", response_model=SubContractorResponse)
def update_sub_contractor(sub_contractor_id: int, sub_contractor: SubContractorCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return sub_contractor_service.update_sub_contractor(db, sub_contractor_id, sub_contractor, current_user.id)

@router.delete("/{sub_contractor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sub_contractor(sub_contractor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sub_contractor_service.delete_sub_contractor(db, sub_contractor_id, current_user.id)
    return None
