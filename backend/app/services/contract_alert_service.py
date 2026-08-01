from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.html_safe import esc
from app.models import Client, User, Company
from app.services.email_service import is_configured, send_and_log
from app.services.module_service import is_module_enabled


def count_contracts_expiring_soon(db: Session, company_id: int, days: int = 30) -> int:
    today = date.today()
    return (
        db.query(Client)
        .filter(
            Client.company_id == company_id,
            Client.contract_end_date.isnot(None),
            Client.contract_end_date >= today,
            Client.contract_end_date <= today + timedelta(days=days),
        )
        .count()
    )


def list_contract_expiry_alerts(db: Session, company_id: int, days: int = 30):
    from app.schemas import ContractExpiryAlert

    today = date.today()
    rows = (
        db.query(Client)
        .filter(
            Client.company_id == company_id,
            Client.contract_end_date.isnot(None),
            Client.contract_end_date >= today,
            Client.contract_end_date <= today + timedelta(days=days),
        )
        .order_by(Client.contract_end_date)
        .all()
    )
    return [
        ContractExpiryAlert(client_id=c.id, client_name=c.name, contract_end_date=c.contract_end_date)
        for c in rows
    ]


def notify_admin_contract_expiry(db: Session, company_id: int) -> None:
    if not is_configured():
        return
    today = date.today()
    window_end = today + timedelta(days=30)
    clients = (
        db.query(Client)
        .filter(
            Client.company_id == company_id,
            Client.contract_end_date.isnot(None),
            Client.contract_end_date >= today,
            Client.contract_end_date <= window_end,
        )
        .all()
    )
    if not clients:
        return
    need_send = [
        c
        for c in clients
        if c.contract_expiry_alert_sent_date is None
        or (today - c.contract_expiry_alert_sent_date).days >= 7
    ]
    if not need_send:
        return
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return
    admin = db.query(User).filter(User.id == company.admin_id).first()
    if not admin or not admin.email:
        return
    if not is_module_enabled(company, "email"):
        return
    lines = "".join(
        f"<li><strong>{esc(c.name)}</strong> — ends {c.contract_end_date.isoformat()}</li>" for c in need_send
    )
    body = f"""<p>The following client contract(s) expire within 30 days:</p><ul>{lines}</ul><p>Open Clients in your dashboard to renew or update dates.</p>"""
    try:
        send_and_log(db, company_id, admin.email, f"Client contract expiry reminder ({len(need_send)} client(s))", body, "alert")
    except Exception:
        return
    for c in need_send:
        c.contract_expiry_alert_sent_date = today
    db.commit()
