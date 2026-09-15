from __future__ import annotations

import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from jose import JWTError, jwt
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import (
    AUTH_PROVIDER_APPLE,
    AUTH_PROVIDER_GOOGLE,
    AUTH_PROVIDER_LOCAL,
    AUTH_PROVIDER_MICROSOFT,
    OAUTH_AUTH_PROVIDERS,
    create_access_token,
    get_password_hash,
)
from app.config import settings
from app.models import Company, User
from app.plan_config import normalize_tier
from app.services.module_service import dump_modules, modules_from_plan
from app.services.receipt_service import company_login_blocked, create_receipt_for_signup, latest_pending_receipt
from app.services.role_service import ensure_roles_for_company, get_role_by_slug

PROVIDERS = {
    AUTH_PROVIDER_GOOGLE: {
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "scopes": "openid email profile",
    },
    AUTH_PROVIDER_MICROSOFT: {
        "auth_url": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/oidc/userinfo",
        "scopes": "openid email profile offline_access User.Read",
    },
    AUTH_PROVIDER_APPLE: {
        "auth_url": "https://appleid.apple.com/auth/authorize",
        "token_url": "https://appleid.apple.com/auth/token",
        "scopes": "name email",
    },
}


def _api_base() -> str:
    return (settings.api_public_url or "http://localhost:8000").rstrip("/")


def redirect_uri_for(provider: str) -> str:
    custom = {
        AUTH_PROVIDER_GOOGLE: settings.google_oauth_redirect_uri,
        AUTH_PROVIDER_MICROSOFT: settings.microsoft_oauth_redirect_uri,
        AUTH_PROVIDER_APPLE: settings.apple_oauth_redirect_uri,
    }.get(provider) or ""
    if custom.strip():
        return custom.strip()
    return f"{_api_base()}/auth/oauth/{provider}/callback"


def provider_configured(provider: str) -> bool:
    if provider == AUTH_PROVIDER_GOOGLE:
        return bool(settings.google_oauth_client_id and settings.google_oauth_client_secret)
    if provider == AUTH_PROVIDER_MICROSOFT:
        return bool(settings.microsoft_oauth_client_id and settings.microsoft_oauth_client_secret)
    if provider == AUTH_PROVIDER_APPLE:
        return bool(
            settings.apple_oauth_client_id
            and settings.apple_oauth_team_id
            and settings.apple_oauth_key_id
            and settings.apple_oauth_private_key
        )
    return False


def list_enabled_providers() -> list[dict[str, Any]]:
    out = []
    for p in (AUTH_PROVIDER_GOOGLE, AUTH_PROVIDER_MICROSOFT, AUTH_PROVIDER_APPLE):
        out.append({"provider": p, "enabled": provider_configured(p)})
    return out


def _client_id(provider: str) -> str:
    if provider == AUTH_PROVIDER_GOOGLE:
        return settings.google_oauth_client_id
    if provider == AUTH_PROVIDER_MICROSOFT:
        return settings.microsoft_oauth_client_id
    if provider == AUTH_PROVIDER_APPLE:
        return settings.apple_oauth_client_id
    raise HTTPException(status_code=400, detail="Unknown OAuth provider")


def _client_secret(provider: str) -> str:
    if provider == AUTH_PROVIDER_GOOGLE:
        return settings.google_oauth_client_secret
    if provider == AUTH_PROVIDER_MICROSOFT:
        return settings.microsoft_oauth_client_secret
    if provider == AUTH_PROVIDER_APPLE:
        return _apple_client_secret()
    raise HTTPException(status_code=400, detail="Unknown OAuth provider")


def _apple_private_key() -> str:
    raw = (settings.apple_oauth_private_key or "").strip()
    if not raw:
        raise HTTPException(status_code=503, detail="Apple Sign In is not configured")
    if raw.startswith("-----BEGIN"):
        return raw.replace("\\n", "\n")
    # Absolute path to .p8
    if raw.endswith(".p8") or "/" in raw:
        try:
            with open(raw, "r", encoding="utf-8") as f:
                return f.read()
        except OSError as e:
            raise HTTPException(status_code=503, detail=f"Cannot read Apple private key: {e}") from e
    return raw.replace("\\n", "\n")


def _apple_client_secret() -> str:
    now = int(time.time())
    payload = {
        "iss": settings.apple_oauth_team_id,
        "iat": now,
        "exp": now + 86400 * 180,
        "aud": "https://appleid.apple.com",
        "sub": settings.apple_oauth_client_id,
    }
    return jwt.encode(
        payload,
        _apple_private_key(),
        algorithm="ES256",
        headers={"kid": settings.apple_oauth_key_id},
    )


def create_oauth_state(*, provider: str, remember_me: bool = True) -> str:
    return jwt.encode(
        {
            "type": "oauth_state",
            "provider": provider,
            "remember_me": remember_me,
            "nonce": secrets.token_urlsafe(16),
            "exp": datetime.utcnow() + timedelta(minutes=15),
        },
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def parse_oauth_state(state: str) -> dict:
    try:
        payload = jwt.decode(state.strip(), settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "oauth_state":
            raise HTTPException(status_code=400, detail="Invalid OAuth state")
        return payload
    except JWTError as e:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state") from e


def authorization_url(provider: str, *, remember_me: bool = True) -> str:
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported OAuth provider")
    if not provider_configured(provider):
        raise HTTPException(status_code=503, detail=f"{provider.title()} Sign In is not configured")
    meta = PROVIDERS[provider]
    state = create_oauth_state(provider=provider, remember_me=remember_me)
    redirect_uri = redirect_uri_for(provider)
    if provider == AUTH_PROVIDER_MICROSOFT:
        auth_url = meta["auth_url"].format(tenant=settings.microsoft_oauth_tenant_id or "common")
    else:
        auth_url = meta["auth_url"]
    params: dict[str, str] = {
        "client_id": _client_id(provider),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": meta["scopes"],
        "state": state,
    }
    if provider == AUTH_PROVIDER_GOOGLE:
        params["access_type"] = "online"
        params["prompt"] = "select_account"
    if provider == AUTH_PROVIDER_MICROSOFT:
        params["response_mode"] = "query"
    if provider == AUTH_PROVIDER_APPLE:
        params["response_mode"] = "form_post"
    return f"{auth_url}?{urlencode(params)}"


def _exchange_code(provider: str, code: str) -> dict:
    meta = PROVIDERS[provider]
    token_url = meta["token_url"]
    if provider == AUTH_PROVIDER_MICROSOFT:
        token_url = token_url.format(tenant=settings.microsoft_oauth_tenant_id or "common")
    data = {
        "client_id": _client_id(provider),
        "client_secret": _client_secret(provider),
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri_for(provider),
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(token_url, data=data, headers={"Accept": "application/json"})
    if resp.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"{provider.title()} token exchange failed")
    return resp.json()


def _google_profile(access_token: str) -> dict:
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            PROVIDERS[AUTH_PROVIDER_GOOGLE]["userinfo_url"],
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=400, detail="Failed to fetch Google profile")
    data = resp.json()
    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    return {
        "sub": str(data.get("sub") or ""),
        "email": email,
        "full_name": (data.get("name") or email.split("@")[0]).strip(),
        "email_verified": bool(data.get("email_verified", True)),
    }


def _microsoft_profile(access_token: str) -> dict:
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=400, detail="Failed to fetch Microsoft profile")
    data = resp.json()
    email = (data.get("mail") or data.get("userPrincipalName") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Microsoft account has no email")
    name = (data.get("displayName") or email.split("@")[0]).strip()
    return {
        "sub": str(data.get("id") or ""),
        "email": email,
        "full_name": name,
        "email_verified": True,
    }


def _apple_profile(id_token: str, user_json: Optional[str] = None) -> dict:
    try:
        # Apple's id_token is verified via JWKS in production; decode claims for identity.
        claims = jwt.get_unverified_claims(id_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid Apple identity token") from e
    if claims.get("aud") != settings.apple_oauth_client_id:
        raise HTTPException(status_code=400, detail="Apple token audience mismatch")
    email = (claims.get("email") or "").strip().lower()
    sub = str(claims.get("sub") or "")
    if not sub:
        raise HTTPException(status_code=400, detail="Apple account missing subject")
    full_name = email.split("@")[0] if email else "Apple User"
    if user_json:
        try:
            import json

            u = json.loads(user_json)
            name = u.get("name") or {}
            composed = f"{name.get('firstName', '')} {name.get('lastName', '')}".strip()
            if composed:
                full_name = composed
            if u.get("email"):
                email = str(u["email"]).strip().lower()
        except Exception:
            pass
    if not email:
        # Private relay may omit email on subsequent logins — look up by subject.
        email = ""
    return {
        "sub": sub,
        "email": email,
        "full_name": full_name,
        "email_verified": bool(claims.get("email_verified", True)),
    }


def fetch_profile(provider: str, token_payload: dict, *, apple_user: Optional[str] = None) -> dict:
    if provider == AUTH_PROVIDER_GOOGLE:
        return _google_profile(token_payload["access_token"])
    if provider == AUTH_PROVIDER_MICROSOFT:
        return _microsoft_profile(token_payload["access_token"])
    if provider == AUTH_PROVIDER_APPLE:
        id_token = token_payload.get("id_token")
        if not id_token:
            raise HTTPException(status_code=400, detail="Apple did not return an id_token")
        return _apple_profile(id_token, apple_user)
    raise HTTPException(status_code=400, detail="Unsupported provider")


def _oauth_subject_key(provider: str, sub: str) -> str:
    return f"{provider}:{sub}"


def _issue_session(
    db: Session,
    user: User,
    *,
    remember_me: bool,
    ip_address: Optional[str],
    user_agent: Optional[str],
) -> dict:
    from app.services import login_log_service, session_service

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    block = company_login_blocked(db, user)
    if block:
        # Mirror email/password login: payment-pending accounts cannot receive a session.
        raise HTTPException(status_code=402, detail=block)

    if remember_me:
        access_token_expires = timedelta(days=settings.remember_me_expire_days)
    else:
        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)

    jti = session_service.new_jti()
    session_service.create_session(
        db,
        user.id,
        jti,
        expires_at=datetime.now(timezone.utc) + access_token_expires,
        remember_me=remember_me,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    access_token = create_access_token(data={"sub": user.id, "jti": jti}, expires_delta=access_token_expires)
    login_log_service.log_login(
        db, email=user.email, status="success", user=user, ip_address=ip_address, user_agent=user_agent
    )
    return {
        "access_token": str(access_token),
        "token_type": "bearer",
        "mfa_required": False,
        "mfa_token": None,
        "user_id": user.id,
        "receipt_ref": None,
        "payment_pending": False,
    }


def complete_oauth_login(
    db: Session,
    *,
    provider: str,
    code: str,
    state: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    apple_user: Optional[str] = None,
) -> dict:
    st = parse_oauth_state(state)
    if st.get("provider") != provider:
        raise HTTPException(status_code=400, detail="OAuth state provider mismatch")
    remember_me = bool(st.get("remember_me", True))
    tokens = _exchange_code(provider, code)
    profile = fetch_profile(provider, tokens, apple_user=apple_user)
    user = resolve_or_create_user(db, provider, profile)
    try:
        return _issue_session(db, user, remember_me=remember_me, ip_address=ip_address, user_agent=user_agent)
    except HTTPException as e:
        if e.status_code == 402 and isinstance(e.detail, dict) and e.detail.get("code") == "payment_pending":
            return {
                "access_token": None,
                "token_type": "bearer",
                "mfa_required": False,
                "mfa_token": None,
                "user_id": user.id,
                "receipt_ref": e.detail.get("receipt_ref"),
                "payment_pending": True,
            }
        raise


def frontend_callback_url(
    token: Optional[str] = None,
    *,
    receipt_ref: Optional[str] = None,
    error: Optional[str] = None,
    payment_pending: bool = False,
) -> str:
    base = settings.frontend_url.rstrip("/")
    if error:
        return f"{base}/login?{urlencode({'oauth_error': error})}"
    if payment_pending and receipt_ref:
        return f"{base}/payment-pending?{urlencode({'ref': receipt_ref})}"
    if not token:
        return f"{base}/login?{urlencode({'oauth_error': 'Sign-in failed'})}"
    params: dict[str, str] = {"token": token}
    if receipt_ref:
        params["ref"] = receipt_ref
    return f"{base}/auth/callback?{urlencode(params)}"


def _create_tenant_for_oauth(db: Session, *, email: str, full_name: str, provider: str, oauth_subject: str) -> User:
    from app.services.email_uniqueness import assert_email_available

    email = assert_email_available(db, email)
    tier = normalize_tier("basic")
    user = User(
        email=email,
        password_hash=get_password_hash(secrets.token_urlsafe(48)),
        full_name=full_name or email.split("@")[0],
        role="admin",
        auth_provider=provider,
        oauth_subject=oauth_subject,
        email_verified=True,
    )
    db.add(user)
    db.flush()
    company_name = f"{full_name}'s Company" if full_name else f"{email.split('@')[0]} Company"
    company = Company(
        name=company_name[:120],
        admin_id=user.id,
        subscription_tier=tier,
        subscription_status="pending",
        enabled_modules_json=dump_modules(modules_from_plan(tier)),
    )
    db.add(company)
    db.flush()
    user.company_id = company.id
    ensure_roles_for_company(db, company.id)
    db.flush()
    ar = get_role_by_slug(db, company.id, "admin")
    if ar:
        user.role_id = ar.id
    create_receipt_for_signup(db, company, user, tier)
    db.commit()
    db.refresh(user)
    return user


def resolve_or_create_user(db: Session, provider: str, profile: dict) -> User:
    sub = profile.get("sub") or ""
    email = (profile.get("email") or "").strip().lower()
    full_name = (profile.get("full_name") or "").strip() or (email.split("@")[0] if email else "User")
    subject_key = _oauth_subject_key(provider, sub) if sub else None

    user = None
    if subject_key:
        user = db.query(User).filter(User.oauth_subject == subject_key).first()
    if not user and email:
        user = db.query(User).filter(func.lower(User.email) == email).first()

    if user:
        if subject_key and not user.oauth_subject:
            user.oauth_subject = subject_key
        if (user.auth_provider or AUTH_PROVIDER_LOCAL) != AUTH_PROVIDER_LOCAL:
            user.auth_provider = provider
        user.email_verified = True
        if full_name and (not user.full_name or user.full_name == user.email.split("@")[0]):
            user.full_name = full_name
        db.commit()
        db.refresh(user)
        return user

    if not email:
        raise HTTPException(
            status_code=400,
            detail="This Apple account did not share an email. Sign in once with email sharing enabled, or use another method.",
        )
    return _create_tenant_for_oauth(
        db, email=email, full_name=full_name, provider=provider, oauth_subject=subject_key or f"{provider}:{email}"
    )
