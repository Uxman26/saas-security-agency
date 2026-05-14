from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Any
from app.models import Site, Client
from app.schemas import SiteCreate
from app.services.company_service import get_company_by_user_id
from app.services.plan_enforcement import enforce_site_quota
from app.services import audit_service
from app.services import contractor_scope


def create_site(db: Session, site: SiteCreate, user_id: int) -> Site:
    company = get_company_by_user_id(db, user_id)
    enforce_site_quota(db, company)
    if site.client_id and not db.query(Client).filter(Client.id == site.client_id, Client.company_id == company.id).first():
        raise HTTPException(status_code=400, detail="Client not found")
    data = {k: v for k, v in (site.model_dump() if hasattr(site, "model_dump") else site.dict()).items()}
    cid = data.pop("contractor_id", None)
    main_id = data.pop("main_contractor_id", None)
    sub_id = data.pop("sub_contractor_id", None)
    if cid is not None:
        if main_id is not None or sub_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Use either directory contractor (contractor_id) or legacy main/sub fields, not both.",
            )
        contractor_scope.resolve_directory_contractor_link(db, company.id, cid)
        next_cid, next_main, next_sub = cid, None, None
    else:
        next_main, next_sub = contractor_scope.apply_site_contractors(db, company.id, main_id, sub_id)
        next_cid = None
    db_site = Site(
        **data,
        company_id=company.id,
        contractor_id=next_cid,
        main_contractor_id=next_main,
        sub_contractor_id=next_sub,
    )
    db.add(db_site)
    db.flush()
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="create",
        entity_type="site",
        entity_id=db_site.id,
        meta={"name": data.get("name")},
    )
    db.commit()
    db.refresh(db_site)
    return db_site


def get_sites(db: Session, user_id: int) -> List[Site]:
    company = get_company_by_user_id(db, user_id)
    return db.query(Site).filter(Site.company_id == company.id).all()


def get_site_by_id(db: Session, site_id: int, user_id: int) -> Site:
    company = get_company_by_user_id(db, user_id)
    site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site


def update_site(db: Session, site_id: int, site: SiteCreate, user_id: int) -> Site:
    company = get_company_by_user_id(db, user_id)
    db_site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    cid_attr = getattr(site, "client_id", None)
    if cid_attr and not db.query(Client).filter(Client.id == cid_attr, Client.company_id == company.id).first():
        raise HTTPException(status_code=400, detail="Client not found")
    raw = site.model_dump() if hasattr(site, "model_dump") else site.dict()
    cid = raw.pop("contractor_id", None)
    main_id = raw.pop("main_contractor_id", None)
    sub_id = raw.pop("sub_contractor_id", None)
    if cid is not None:
        if main_id is not None or sub_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Use either directory contractor (contractor_id) or legacy main/sub fields, not both.",
            )
        contractor_scope.resolve_directory_contractor_link(db, company.id, cid)
        db_site.contractor_id = cid
        db_site.main_contractor_id = None
        db_site.sub_contractor_id = None
    else:
        next_main, next_sub = contractor_scope.apply_site_contractors(db, company.id, main_id, sub_id)
        db_site.contractor_id = None
        db_site.main_contractor_id = next_main
        db_site.sub_contractor_id = next_sub
    for key, value in raw.items():
        setattr(db_site, key, value)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="update",
        entity_type="site",
        entity_id=site_id,
    )
    db.commit()
    db.refresh(db_site)
    return db_site


def delete_site(db: Session, site_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="delete",
        entity_type="site",
        entity_id=site_id,
    )
    db.delete(site)
    db.commit()
