from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from app.models import Site, Client
from app.schemas import SiteCreate
from app.services.company_service import get_company_by_user_id

def create_site(db: Session, site: SiteCreate, user_id: int) -> Site:
    company = get_company_by_user_id(db, user_id)
    if site.client_id and not db.query(Client).filter(Client.id == site.client_id, Client.company_id == company.id).first():
        raise HTTPException(status_code=400, detail="Client not found")
    data = {k: v for k, v in (site.model_dump() if hasattr(site, "model_dump") else site.dict()).items()}
    db_site = Site(**data, company_id=company.id)
    db.add(db_site)
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
    
    cid = getattr(site, "client_id", None)
    if cid and not db.query(Client).filter(Client.id == cid, Client.company_id == company.id).first():
        raise HTTPException(status_code=400, detail="Client not found")
    for key, value in (site.model_dump() if hasattr(site, "model_dump") else site.dict()).items():
        setattr(db_site, key, value)
    
    db.commit()
    db.refresh(db_site)
    return db_site

def delete_site(db: Session, site_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    db.delete(site)
    db.commit()
