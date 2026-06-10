from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Tuple
from app.models import Contractor, ContractorKind, MainContractor, SubContractor, Guard, Site


def resolve_directory_contractor_link(db: Session, company_id: int, contractor_id: UUID) -> Contractor:
    c = (
        db.query(Contractor)
        .filter(
            Contractor.id == contractor_id,
            Contractor.company_id == company_id,
            Contractor.is_active.is_(True),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=400, detail="Contractor not found or inactive")
    if c.type not in (ContractorKind.main, ContractorKind.sub):
        raise HTTPException(status_code=400, detail="Invalid contractor type for guard or site link")
    return c


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
    if main_id and sub_id:
        raise HTTPException(status_code=400, detail="Link either a main contractor or a sub contractor, not both.")
    if main_id:
        assert_main_in_company(db, main_id, company_id)
        return main_id, None
    if sub_id:
        assert_sub_in_company(db, sub_id, company_id)
        return None, sub_id
    return None, None


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
    return bool(g.contractor_id or g.main_contractor_id or g.sub_contractor_id)


def site_has_contractor(s: Site) -> bool:
    return bool(s.contractor_id or s.main_contractor_id or s.sub_contractor_id)


def assert_unified_main_sub_same_company(
    db: Session,
    company_id: int,
    main_contractor_id: UUID,
    sub_contractor_id: UUID,
) -> tuple[Contractor, Contractor]:
    main_c = db.query(Contractor).filter(Contractor.id == main_contractor_id).first()
    sub_c = db.query(Contractor).filter(Contractor.id == sub_contractor_id).first()
    if not main_c or not sub_c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    if main_c.company_id != company_id or sub_c.company_id != company_id:
        raise HTTPException(status_code=422, detail="Contractors must belong to your company.")
    if main_c.type != ContractorKind.main:
        raise HTTPException(status_code=422, detail="Selected main contractor must have type main")
    if sub_c.type != ContractorKind.sub:
        raise HTTPException(status_code=422, detail="Selected sub contractor must have type sub")
    return main_c, sub_c
