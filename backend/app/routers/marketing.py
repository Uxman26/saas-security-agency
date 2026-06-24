from pydantic import BaseModel, EmailStr, Field
from fastapi import APIRouter

from app.config import settings
from app.services import email_service

router = APIRouter(prefix="/marketing", tags=["marketing"])


class DemoRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    company_name: str = Field(min_length=2, max_length=100)
    industry: str = Field(min_length=1, max_length=80)
    workforce_size: str = Field(min_length=1, max_length=40)
    challenge: str = Field(min_length=10, max_length=2000)
    phone: str | None = Field(default=None, max_length=40)
    current_system: str | None = Field(default=None, max_length=200)
    preferred_time: str | None = Field(default=None, max_length=200)


@router.post("/demo")
def request_demo(body: DemoRequest):
    recipient = (settings.super_admin_email or settings.mail_from or "").strip()
    if recipient and email_service.is_configured():
        rows = [
            ("Name", body.full_name),
            ("Email", body.email),
            ("Company", body.company_name),
            ("Industry", body.industry),
            ("Workforce size", body.workforce_size),
            ("Challenge", body.challenge),
            ("Phone", body.phone or "—"),
            ("Current system", body.current_system or "—"),
            ("Preferred time", body.preferred_time or "—"),
        ]
        html = "<br>".join(f"<b>{k}:</b> {v}" for k, v in rows)
        try:
            email_service.send_email(recipient, f"ControlOps demo request — {body.company_name}", html)
        except Exception:
            pass
    return {"ok": True}
