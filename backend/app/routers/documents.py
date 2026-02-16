from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.schemas import GuardDocumentCreate, GuardDocumentResponse
from app.auth import get_current_user
from app.services import guard_document_service

router = APIRouter(prefix="/guards/{guard_id}/documents", tags=["documents"])

@router.post("", response_model=GuardDocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(guard_id: int, doc: GuardDocumentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return guard_document_service.create_document(db, guard_id, doc, current_user.id)

@router.get("", response_model=List[GuardDocumentResponse])
def list_documents(guard_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return guard_document_service.get_documents(db, guard_id, current_user.id)

@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(guard_id: int, doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    guard_document_service.delete_document(db, doc_id, current_user.id)
    return None
