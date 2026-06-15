from typing import Optional

from sqlalchemy.orm import Session

from app.models import LoginLog, User


def log_login(
    db: Session,
    *,
    email: str,
    status: str,
    user: Optional[User] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> LoginLog:
    row = LoginLog(
        user_id=user.id if user else None,
        email=email,
        full_name=user.full_name if user else None,
        company_id=user.company_id if user else None,
        ip_address=ip_address,
        user_agent=(user_agent or "")[:500] or None,
        status=status,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_login_logs(db: Session, limit: int = 200, company_id: Optional[int] = None) -> list[LoginLog]:
    q = db.query(LoginLog).order_by(LoginLog.id.desc())
    if company_id:
        q = q.filter(LoginLog.company_id == company_id)
    return q.limit(limit).all()
