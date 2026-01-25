import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import HTTPException
from app.config import settings

def send_email(to_email: str, subject: str, body: str) -> bool:
    if not settings.mail_username or not settings.mail_password:
        raise HTTPException(status_code=500, detail="Email service not configured")
    
    if not to_email:
        raise HTTPException(status_code=400, detail="Recipient email is required")
    
    try:
        msg = MIMEMultipart()
        msg['From'] = f"{settings.mail_from_name} <{settings.mail_from}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        
        msg.attach(MIMEText(body, 'html'))
        
        server = smtplib.SMTP(settings.mail_server, settings.mail_port)
        server.starttls()
        server.login(settings.mail_username, settings.mail_password)
        server.send_message(msg)
        server.quit()
        
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
