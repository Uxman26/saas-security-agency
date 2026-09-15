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
    # Failed logins allowed per account before a timed lockout, and per IP spray limit.
    login_max_attempts_per_account: int = 3
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

    # Social sign-in (leave blank to disable a provider). Redirect URIs must match
    # the provider console exactly — defaults use FRONTEND_URL / API paths below.
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_redirect_uri: str = ""

    microsoft_oauth_client_id: str = ""
    microsoft_oauth_client_secret: str = ""
    microsoft_oauth_tenant_id: str = "common"
    microsoft_oauth_redirect_uri: str = ""

    apple_oauth_client_id: str = ""
    apple_oauth_team_id: str = ""
    apple_oauth_key_id: str = ""
    # PEM private key contents (use \n for newlines) or absolute path to .p8 file
    apple_oauth_private_key: str = ""
    apple_oauth_redirect_uri: str = ""

    # Public API origin used to build default OAuth redirect URIs when unset
    api_public_url: str = "http://localhost:8000"

    @field_validator("database_url", mode="before")
    @classmethod
    def default_sqlite_if_placeholder(cls, v: str) -> str:
        if v and v.startswith("postgresql://user:password@"):
            return "sqlite:///./security.db"
        return v or "sqlite:///./security.db"

    class Config:
        env_file = ".env"

settings = Settings()
