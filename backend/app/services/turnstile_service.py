"""Cloudflare Turnstile verification for browser-facing auth endpoints.

Disabled while TURNSTILE_SECRET_KEY is blank, so it can ship before keys exist.
The widget token arrives in the ``X-Turnstile-Token`` header rather than the JSON
body: auth request models are StrictModel (extra fields rejected), and the mobile
app must keep working without any change.

Only browser requests (User-Agent containing "Mozilla") are challenged. The native
app identifies as ``ControlOpsMobile/...`` and is covered by the existing per-account
and per-IP login lockouts instead.
"""
import logging
from typing import Optional

import httpx
from fastapi import HTTPException, Request, status

from app.config import settings

logger = logging.getLogger(__name__)

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
HEADER = "x-turnstile-token"


def _is_browser(request: Request) -> bool:
    return "mozilla" in (request.headers.get("user-agent") or "").lower()


def _client_ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("cf-connecting-ip") or request.headers.get("x-real-ip")
    if fwd:
        return fwd.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


def require_turnstile(request: Request) -> None:
    """FastAPI dependency: 400 unless a valid Turnstile token is supplied (browsers only)."""
    secret = (settings.turnstile_secret_key or "").strip()
    if not secret or not _is_browser(request):
        return
    token = (request.headers.get(HEADER) or "").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please complete the security check.",
        )
    data = {"secret": secret, "response": token}
    ip = _client_ip(request)
    if ip:
        data["remoteip"] = ip
    try:
        with httpx.Client(timeout=8.0) as client:
            result = client.post(VERIFY_URL, data=data).json()
    except Exception:
        # Fail open on a Cloudflare outage: lockouts still protect the endpoint, and
        # blocking every sign-in because a third party is down is the worse outcome.
        logger.warning("Turnstile verify unreachable; allowing request", exc_info=True)
        return
    if not result.get("success"):
        logger.info("Turnstile rejected: %s", result.get("error-codes"))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security check failed. Please try again.",
        )
