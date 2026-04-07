from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Tuple
from app.models import MainContractor, SubContractor, Guard, Site


def require_one_contractor_ref(main_contractor_id: Optional[int], sub_contractor_id: Optional[int], msg: str) -> None:
    if main_contractor_id and sub_contractor_id:
        raise HTTPException(status_code=400, detail="Link either a main contractor or a sub contractor, not both.")
    if not main_contractor_id and not sub_contractor_id:
        raise HTTPException(status_code=400, detail=msg)


def assert_main_in_company(db: Session, main_id: int, company_id: int) -> MainContractor:
    m = db.query(MainContractor).filter(MainContractor.id == main_id, MainContractor.company_id == company_id).first()
    if not m:
        raise HTTPException(status_code=400, detail="Main contractor not found")
    return m


def assert_sub_in_company(db: Session, sub_id: int, company_id: int) -> SubContractor:
    s = db.query(SubContractor).filter(SubContractor.id == sub_id, SubContractor.company_id == company_id).first()
    if not s:
        raise HTTPException(status_code=400, detail="Sub contractor not found")
    return s


def apply_guard_contractors(db: Session, company_id: int, main_id: Optional[int], sub_id: Optional[int]) -> Tuple[Optional[int], Optional[int]]:
    require_one_contractor_ref(
        main_id,
        sub_id,
        "A contractor (main or sub) is required for each guard.",
    )
    if main_id:
        assert_main_in_company(db, main_id, company_id)
        return main_id, None
    assert sub_id
    assert_sub_in_company(db, sub_id, company_id)
    return None, sub_id


def apply_site_contractors(db: Session, company_id: int, main_id: Optional[int], sub_id: Optional[int]) -> Tuple[Optional[int], Optional[int]]:
    require_one_contractor_ref(
        main_id,
        sub_id,
        "A contractor (main or sub) is required for each site.",
    )
    if main_id:
        assert_main_in_company(db, main_id, company_id)
        return main_id, None
    assert sub_id
    assert_sub_in_company(db, sub_id, company_id)
    return None, sub_id


def guard_has_contractor(g: Guard) -> bool:
    return bool(g.main_contractor_id or g.sub_contractor_id)


def site_has_contractor(s: Site) -> bool:
    return bool(s.main_contractor_id or s.sub_contractor_id)
