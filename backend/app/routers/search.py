from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import get_current_user
from app.services import search_service

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def search(
    q: str = Query("", min_length=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return search_service.tenant_search(db, current_user, q)
