import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.config import settings

SUPER_ADMIN_ROLE = "super_admin"

# Every token we mint carries an explicit `type`. get_current_user accepts ONLY
# ACCESS_TOKEN_TYPE, because password-reset and email-verification tokens are signed
# with the same secret and would otherwise authenticate as full access tokens — and
# verification tokens travel through email URLs.
ACCESS_TOKEN_TYPE = "access"
PASSWORD_RESET_TOKEN_TYPE = "password_reset"
EMAIL_VERIFY_TOKEN_TYPE = "email_verify"

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/swagger-login",
    scheme_name="EmailPassword",
    description="Enter the account email in the Username field and the account password.",
    auto_error=False,
)

def _password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(_password_bytes(plain_password), hashed_password.encode("utf-8"))

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("utf-8")

def create_access_token(data: dict, expires_delta: timedelta = None):
    """Mint an access token.

    Pass a `jti` naming a ``user_sessions`` row; ``get_current_user`` requires one, so a
    token minted without a session cannot authenticate.
    """
    to_encode = data.copy()
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire, "type": ACCESS_TOKEN_TYPE})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return str(encoded_jwt) if not isinstance(encoded_jwt, str) else encoded_jwt

def create_password_reset_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(hours=1)
    payload = {"sub": str(user_id), "type": PASSWORD_RESET_TOKEN_TYPE, "exp": expire}
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return str(token) if not isinstance(token, str) else token

def verify_password_reset_token(token: str) -> int:
    try:
        payload = jwt.decode(token.strip(), settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != PASSWORD_RESET_TOKEN_TYPE:
            raise HTTPException(status_code=400, detail="Invalid or expired reset link")
        return int(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

def create_email_verification_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(hours=24)
    payload = {"sub": str(user_id), "type": EMAIL_VERIFY_TOKEN_TYPE, "exp": expire}
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return str(token) if not isinstance(token, str) else token

def verify_email_verification_token(token: str) -> int:
    try:
        payload = jwt.decode(token.strip(), settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != EMAIL_VERIFY_TOKEN_TYPE:
            raise HTTPException(status_code=400, detail="Invalid or expired verification link")
        return int(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")

AUTH_PROVIDER_LOCAL = "local"
AUTH_PROVIDER_GOOGLE = "google"
AUTH_PROVIDER_MICROSOFT = "microsoft"
OAUTH_AUTH_PROVIDERS = frozenset({AUTH_PROVIDER_GOOGLE, AUTH_PROVIDER_MICROSOFT})

def requires_email_verification(user: User) -> bool:
    provider = getattr(user, "auth_provider", None) or AUTH_PROVIDER_LOCAL
    if provider in OAUTH_AUTH_PROVIDERS:
        return False
    return not bool(getattr(user, "email_verified", False))

def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = (token or "").strip()
        if not token:
            raise credentials_exception
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != ACCESS_TOKEN_TYPE:
            raise credentials_exception
        sub = payload.get("sub")
        if sub is None:
            raise credentials_exception
        user_id = int(sub)
        jti = payload.get("jti")
    except (JWTError, ValueError):
        raise credentials_exception

    # The token is only a pointer to a session row. If that row is gone, revoked, past
    # its absolute expiry, or idle for too long, the token is spent — regardless of the
    # `exp` it carries. This is what makes logout and idle timeout take effect in every
    # tab rather than only the one that cleared its storage.
    from app.services import session_service

    session = session_service.active_session(db, jti)
    if session is None or session.user_id != user_id:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
    if getattr(user, "role", None) != SUPER_ADMIN_ROLE:
        from app.services.receipt_service import company_subscription_blocked
        block = company_subscription_blocked(db, user)
        if block:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=block,
            )
    # Only a request that actually succeeded counts as activity.
    session_service.touch(db, session)
    return user


def current_session_jti(token: str | None = Depends(oauth2_scheme)) -> str | None:
    """The `jti` of the presented token, for routes that act on the session itself.

    Does not authenticate — pair it with ``get_current_user``. Returns None for a token
    that will not decode, so logout stays idempotent instead of erroring.
    """
    try:
        payload = jwt.decode((token or "").strip(), settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        return None
    return payload.get("jti")


def get_current_super_admin(user: User = Depends(get_current_user)) -> User:
    if getattr(user, "role", None) != SUPER_ADMIN_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin only")
    return user
