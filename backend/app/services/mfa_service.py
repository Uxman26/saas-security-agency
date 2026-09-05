from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import pyotp
from fastapi import HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User

MFA_CHALLENGE_TYPE = "mfa_challenge"


def _now():
    return datetime.now(timezone.utc)


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(user: User, secret: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="ControlOps Admin")


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def make_backup_codes(n: int = 8) -> list[str]:
    return [secrets.token_hex(4).upper() for _ in range(n)]


def dump_backup_codes(codes: list[str]) -> str:
    return json.dumps(codes)


def load_backup_codes(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except (TypeError, ValueError):
        return []


def consume_backup_code(user: User, code: str) -> bool:
    codes = load_backup_codes(user.mfa_backup_codes_json)
    normalized = code.strip().upper().replace(" ", "")
    if normalized not in codes:
        return False
    codes = [c for c in codes if c != normalized]
    user.mfa_backup_codes_json = dump_backup_codes(codes)
    return True


def create_mfa_challenge_token(user_id: int, remember_me: bool = False) -> str:
    expire = datetime.utcnow() + timedelta(minutes=5)
    payload = {
        "sub": str(user_id),
        "type": MFA_CHALLENGE_TYPE,
        "exp": expire,
        "remember_me": remember_me,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return str(token) if not isinstance(token, str) else token


def verify_mfa_challenge_token(token: str) -> tuple[int, bool]:
    try:
        payload = jwt.decode(token.strip(), settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != MFA_CHALLENGE_TYPE:
            raise HTTPException(status_code=400, detail="Invalid MFA challenge")
        return int(payload["sub"]), bool(payload.get("remember_me"))
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status_code=400, detail="Invalid or expired MFA challenge")


def setup_mfa(db: Session, user: User) -> dict:
    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="MFA setup is for platform admins")
    secret = generate_secret()
    user.mfa_secret = secret
    user.mfa_enabled = False
    db.commit()
    return {
        "secret": secret,
        "otpauth_uri": provisioning_uri(user, secret),
        "enabled": False,
    }


def confirm_mfa(db: Session, user: User, code: str) -> dict:
    if not user.mfa_secret:
        raise HTTPException(status_code=400, detail="Start MFA setup first")
    if not verify_totp(user.mfa_secret, code):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    codes = make_backup_codes()
    user.mfa_enabled = True
    user.mfa_backup_codes_json = dump_backup_codes(codes)
    db.commit()
    return {"enabled": True, "backup_codes": codes}


def disable_mfa(db: Session, user: User, code: str) -> dict:
    if not user.mfa_enabled:
        return {"enabled": False}
    ok = verify_totp(user.mfa_secret or "", code) or consume_backup_code(user, code)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid code")
    user.mfa_enabled = False
    user.mfa_secret = None
    user.mfa_backup_codes_json = None
    db.commit()
    return {"enabled": False}


def validate_mfa_code(user: User, code: str) -> bool:
    if verify_totp(user.mfa_secret or "", code):
        return True
    return consume_backup_code(user, code)
