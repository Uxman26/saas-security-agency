"""Records which client made the current request, for the shift history log.

Mobile and web both call the same endpoints, so the audit trail cannot tell them apart
from the route alone. The classification is held in a context variable set here rather
than threaded through every service signature: the services that write audit rows sit
several calls below the router, and most of them are also called from background sync
paths that have no request at all (where the value simply falls back to "system").

This is a pure ASGI middleware, not BaseHTTPMiddleware, so the value is set on the same
task that runs the endpoint.
"""

from __future__ import annotations

from contextvars import ContextVar

_client_source: ContextVar[str] = ContextVar("client_source", default="system")

# Explicit header beats sniffing. Mobile builds should send X-Client-App: mobile.
_HEADER_KEYS = (b"x-client-app", b"x-client")
_MOBILE_HINTS = ("mobile", "android", "iphone", "ipad", "ios", "okhttp", "dart", "expo", "cfnetwork", "capacitor")


def get_client_source() -> str:
    """One of: web, mobile, api, system."""
    return _client_source.get()


def set_client_source(value: str) -> None:
    _client_source.set(value)


def classify(header_value: str, user_agent: str) -> str:
    explicit = (header_value or "").strip().lower()
    if explicit:
        if "mobile" in explicit:
            return "mobile"
        if "web" in explicit:
            return "web"
        return "api"
    ua = (user_agent or "").strip().lower()
    if not ua:
        return "api"
    if any(hint in ua for hint in _MOBILE_HINTS):
        return "mobile"
    if "mozilla" in ua:
        return "web"
    return "api"


class ClientSourceMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        explicit = ""
        for key in _HEADER_KEYS:
            if headers.get(key):
                explicit = headers[key].decode("latin-1", "ignore")
                break
        ua = headers.get(b"user-agent", b"").decode("latin-1", "ignore")
        token = _client_source.set(classify(explicit, ua))
        try:
            await self.app(scope, receive, send)
        finally:
            _client_source.reset(token)
