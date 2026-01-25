from fastapi import APIRouter, Depends, HTTPException, status
from app.models import User
from app.auth import get_current_user
from app.schemas import EmailRequest
from app.services import email_service

router = APIRouter(prefix="/email", tags=["email"])

@router.post("/send", status_code=status.HTTP_200_OK)
def send_email(email_data: EmailRequest, current_user: User = Depends(get_current_user)):
    try:
        email_service.send_email(email_data.to_email, email_data.subject, email_data.body)
        return {"message": "Email sent successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
