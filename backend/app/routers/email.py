from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import EmailLog, User
from app.rbac import require_perm, PERM_EMAIL_SEND
from app.schemas import EmailRequest
from app.services import email_service
from app.services.company_service import get_company_by_user_id

router = APIRouter(prefix="/email", tags=["email"])

@router.post("/send", status_code=status.HTTP_200_OK)
def send_email(email_data: EmailRequest, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_EMAIL_SEND))):
    try:
        company = get_company_by_user_id(db, current_user.id)
        email_service.send_email(email_data.to_email, email_data.subject, email_data.body)
        db.add(EmailLog(company_id=company.id, recipient=email_data.to_email, subject=email_data.subject, status="sent"))
        db.commit()
        return {"message": "Email sent successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
