from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://user:password@localhost:5432/security_db"
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    mail_username: str = ""
    mail_password: str = ""
    mail_from: str = "noreply@securityagency.com"
    mail_port: int = 587
    mail_server: str = "smtp.gmail.com"
    mail_from_name: str = "Security Agency"
    
    class Config:
        env_file = ".env"

settings = Settings()
