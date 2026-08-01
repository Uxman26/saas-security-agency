from pydantic import field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite:///./security.db"
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    remember_me_expire_days: int = 30
    # Idle timeout: a session unused for this long is dead, enforced server-side on
    # every request. The token's own `exp` is the absolute ceiling on top of this.
    session_idle_timeout_minutes: int = 30
    # A "remember me" sign-in is an explicit request to stay signed in on a trusted
    # device, so it gets a longer idle window — still bounded, and still subject to
    # logout and the absolute expiry.
    session_remember_idle_days: int = 7
    # How stale last_seen_at may get before we write it again. Without this every
    # authenticated request would issue an UPDATE.
    session_touch_interval_seconds: int = 60
    # Failed logins allowed per account, and per IP, inside the window below.
    login_max_attempts_per_account: int = 5
    login_max_attempts_per_ip: int = 20
    login_attempt_window_minutes: int = 15
    login_lockout_minutes: int = 15
    mail_username: str = ""
    mail_password: str = ""
    mail_from: str = "noreply@securityagency.com"
    mail_port: int = 587
    mail_server: str = "smtp.gmail.com"
    mail_use_tls: bool = True
    mail_from_name: str = "ControlOps"
    super_admin_email: str = ""
    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3001"
    redis_url: str = "redis://localhost:6379/0"
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_application_fee_percent: float = 0
    stripe_yearly_discount_coupon_id: str = ""
    payment_failed_lock_retries: int = 3

    @field_validator("database_url", mode="before")
    @classmethod
    def default_sqlite_if_placeholder(cls, v: str) -> str:
        if v and v.startswith("postgresql://user:password@"):
            return "sqlite:///./security.db"
        return v or "sqlite:///./security.db"

    class Config:
        env_file = ".env"

settings = Settings()
