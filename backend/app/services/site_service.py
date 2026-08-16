from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Any
from app.models import Site, Client, User
from app.schemas import SiteCreate
from app.services.company_service import get_company_by_user_id
from app.services.plan_enforcement import enforce_site_quota
from app.services import audit_service
from app.services import contractor_scope


# Carried on SiteCreate to drive portal-login creation; not columns on Site, so they must
# never reach the model constructor or the update setattr loop.
_NON_COLUMN_FIELDS = ("create_login", "login_email", "login_full_name", "login_password")


def _site_payload(site) -> dict:
    data = site.model_dump() if hasattr(site, "model_dump") else site.dict()
    for f in _NON_COLUMN_FIELDS:
        data.pop(f, None)
    return data


def create_site(db: Session, site: SiteCreate, user_id: int) -> Site:
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    from app.services.portal_access import is_portal_role

    if user and is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    enforce_site_quota(db, company)
    if site.client_id and not db.query(Client).filter(Client.id == site.client_id, Client.company_id == company.id).first():
        raise HTTPException(status_code=400, detail="Client not found")
    data = _site_payload(site)
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
    if getattr(site, "create_login", False):
        _create_site_login(db, db_site, company.id, site)
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


def _create_site_login(db: Session, db_site: Site, company_id: int, data: SiteCreate) -> None:
    """Create a Client-role portal user pinned to this one site.

    The site does not need a client. A site with no client produces a standalone login
    scoped purely by its pin, which is what makes a site independent of any client; a
    site that does have one keeps the client link as well, so the same login still
    reads correctly if it is later widened to that client's other sites.

    Same transactional shape as client_service._create_client_login: every validation
    below (and inside create_company_user) raises before that function commits, so a
    rejected login leaves the flushed site row uncommitted and the request rolls back
    both together — no orphan site.
    """
    from app.schemas import CompanyUserCreate
    from app.services import role_service, user_service

    email = (data.login_email or data.contact_email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required to create a portal login")
    if not data.login_password:
        raise HTTPException(status_code=400, detail="Password is required to create a portal login")

    role = role_service.get_role_by_slug(db, company_id, "client")
    if not role:
        role_service.ensure_roles_for_company(db, company_id)
        role = role_service.get_role_by_slug(db, company_id, "client")
    if not role:
        raise HTTPException(status_code=500, detail="Client role is not configured for this company")

    full_name = (
        (data.login_full_name or "").strip()
        or (data.contact_person or "").strip()
        or db_site.name
    )
    user_service.create_company_user(
        db,
        company_id,
        CompanyUserCreate(
            email=email,
            password=data.login_password,
            full_name=full_name,
            role_id=role.id,
            client_id=db_site.client_id,
            site_ids=[db_site.id],
        ),
    )


def get_sites(db: Session, user_id: int) -> List[Site]:
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    q = db.query(Site).filter(Site.company_id == company.id)
    if user:
        from app.services.portal_access import filter_sites_for_user, is_portal_role

        if is_portal_role(user):
            q = filter_sites_for_user(db, user, q)
    return q.all()


def get_site_by_id(db: Session, site_id: int, user_id: int) -> Site:
    company = get_company_by_user_id(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if user:
        from app.services.portal_access import filter_sites_for_user, is_portal_role

        if is_portal_role(user):
            allowed = filter_sites_for_user(db, user, db.query(Site).filter(Site.id == site_id)).first()
            if not allowed:
                raise HTTPException(status_code=404, detail="Site not found")
    return site


def _block_portal_roles(db: Session, user_id: int) -> None:
    """Site records are internal: they carry staff pay rates, billing rates and
    contractor links. A portal login reads sites, it never writes them, so the write
    paths refuse portal roles outright rather than trusting the module matrix — an
    admin ticking Edit on the Client role must not hand a customer the ability to
    rewrite their own rates.
    """
    from app.services.portal_access import is_portal_role

    user = db.query(User).filter(User.id == user_id).first()
    if user and is_portal_role(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def list_site_portal_logins(db: Session, site_id: int, user_id: int) -> List[User]:
    """The portal logins pinned to this site, for the Portal login panel on its edit screen.

    Only pinned logins count. A client login with no pins can see this site through its
    client, but it is not this site's login and must not be managed from here.
    """
    from app.models import UserSite

    site = get_site_by_id(db, site_id, user_id)
    _block_portal_roles(db, user_id)
    return (
        db.query(User)
        .join(UserSite, UserSite.user_id == User.id)
        .filter(User.company_id == site.company_id, UserSite.site_id == site.id)
        .order_by(User.email)
        .all()
    )


def set_site_login_password(db: Session, site_id: int, login_user_id: int, new_password: str, user_id: int) -> User:
    """Set a new password on one of this site's pinned portal logins.

    The login must already be pinned to this site. Checking that here — rather than
    trusting the id the screen sends — keeps the site editor from being able to reach any
    other account in the company, whatever it posts.
    """
    from app.services import user_service

    logins = {u.id for u in list_site_portal_logins(db, site_id, user_id)}
    if login_user_id not in logins:
        raise HTTPException(status_code=404, detail="Portal login not found for this site")
    company = get_company_by_user_id(db, user_id)
    return user_service.reset_company_user_password(db, company.id, login_user_id, new_password)


def update_site(db: Session, site_id: int, site: SiteCreate, user_id: int) -> Site:
    _block_portal_roles(db, user_id)
    company = get_company_by_user_id(db, user_id)
    db_site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    cid_attr = getattr(site, "client_id", None)
    if cid_attr and not db.query(Client).filter(Client.id == cid_attr, Client.company_id == company.id).first():
        raise HTTPException(status_code=400, detail="Client not found")
    raw = _site_payload(site)
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
    _block_portal_roles(db, user_id)
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
