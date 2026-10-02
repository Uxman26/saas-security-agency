from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Client, Guard, Invoice, Site, User
from app.services.company_service import get_company_by_user_id
from app.services.portal_access import is_portal_role


def tenant_search(db: Session, user: User, q: str, *, limit: int = 8) -> dict:
    if is_portal_role(user):
        return {"guards": [], "sites": [], "clients": [], "invoices": []}
    company = get_company_by_user_id(db, user.id)
    term = (q or "").strip()
    if len(term) < 2:
        return {"guards": [], "sites": [], "clients": [], "invoices": []}
    like = f"%{term}%"
    lim = max(1, min(limit, 20))

    guards = (
        db.query(Guard)
        .filter(Guard.company_id == company.id, Guard.deleted_at.is_(None), Guard.full_name.ilike(like))
        .order_by(Guard.full_name.asc())
        .limit(lim)
        .all()
    )
    sites = (
        db.query(Site)
        .filter(Site.company_id == company.id, Site.deleted_at.is_(None), Site.name.ilike(like))
        .order_by(Site.name.asc())
        .limit(lim)
        .all()
    )
    clients = (
        db.query(Client)
        .filter(Client.company_id == company.id, Client.deleted_at.is_(None), Client.name.ilike(like))
        .order_by(Client.name.asc())
        .limit(lim)
        .all()
    )
    invoices = []
    if term.isdigit():
        inv = (
            db.query(Invoice)
            .filter(Invoice.company_id == company.id, Invoice.deleted_at.is_(None), Invoice.id == int(term))
            .first()
        )
        if inv:
            invoices = [inv]
    return {
        "guards": [{"id": g.id, "name": g.full_name, "href": f"/guards/{g.id}"} for g in guards],
        "sites": [{"id": s.id, "name": s.name, "href": f"/sites/{s.id}"} for s in sites],
        "clients": [{"id": c.id, "name": c.name, "href": f"/clients/{c.id}"} for c in clients],
        "invoices": [{"id": i.id, "name": f"Invoice #{i.id}", "href": f"/invoices/{i.id}/view"} for i in invoices],
    }
