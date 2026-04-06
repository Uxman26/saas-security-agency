from pydantic import field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite:///./security.db"
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    mail_username: str = ""
    mail_password: str = ""
    mail_from: str = "noreply@securityagency.com"
    mail_port: int = 587
    mail_server: str = "smtp.gmail.com"
    mail_from_name: str = "Security Agency"
    super_admin_email: str = ""
    cors_origins: str = "http://localhost:3000"
    redis_url: str = "redis://localhost:6379/0"

    @field_validator("database_url", mode="before")
    @classmethod
    def default_sqlite_if_placeholder(cls, v: str) -> str:
        if v and v.startswith("postgresql://user:password@"):
            return "sqlite:///./security.db"
        return v or "sqlite:///./security.db"

    class Config:
        env_file = ".env"

settings = Settings()
