import errno
import json
import logging
import os
import smtplib
import socket
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException

from app.config import settings

logger = logging.getLogger(__name__)

# Must live on the mounted data volume (/app/data, same place as the sqlite db),
# NOT app/data inside the image — settings written there are lost on every rebuild.
_DATA_DIR = os.environ.get("APP_DATA_DIR") or os.path.join(os.getcwd(), "data")
_SMTP_FILE = os.path.join(_DATA_DIR, "platform_smtp.json")
_SMTP_TIMEOUT = 15


def _read_raw() -> dict:
    if not os.path.isfile(_SMTP_FILE):
        return {}
    try:
        with open(_SMTP_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _write_raw(data: dict) -> None:
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(_SMTP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_smtp_config() -> dict[str, Any]:
    """
    Admin-UI settings are the source of truth. Env vars are only a fallback for a
    fresh install — once credentials are saved in the UI, env is ignored entirely
    so a stale MAIL_* value can never silently override what the admin set.
    """
    raw = _read_raw()
    saved_creds = bool(raw.get("mail_username") and raw.get("mail_password"))

    def pick(key: str, fallback: Any) -> Any:
        if saved_creds and key in raw and raw.get(key) not in (None, ""):
            return raw.get(key)
        if saved_creds and key in ("mail_username", "mail_password"):
            return raw.get(key)
        return raw.get(key) or fallback

    port = pick("mail_port", settings.mail_port)
    use_tls = raw.get("mail_use_tls")
    try:
        port_i = int(port or 587)
    except (TypeError, ValueError):
        port_i = 587
    return {
        "mail_server": (pick("mail_server", settings.mail_server) or "") or "",
        "mail_port": port_i,
        "mail_use_tls": use_tls if use_tls is not None else settings.mail_use_tls,
        "mail_username": pick("mail_username", settings.mail_username) or "",
        "mail_password": pick("mail_password", settings.mail_password) or "",
        "mail_from": (pick("mail_from", settings.mail_from) or "") or "",
        "mail_from_name": (pick("mail_from_name", settings.mail_from_name) or "") or "",
    }


def smtp_status() -> dict[str, Any]:
    cfg = get_smtp_config()
    configured = bool(cfg.get("mail_username") and cfg.get("mail_password"))
    # Never return None for string fields — SmtpConfigResponse requires str and a
    # validation 500 was surfacing in the Super Admin UI as "API temporarily unavailable".
    port = cfg.get("mail_port") or 587
    try:
        port = int(port)
    except (TypeError, ValueError):
        port = 587
    return {
        "mail_server": (cfg.get("mail_server") or "") or "",
        "mail_port": port,
        "mail_from": (cfg.get("mail_from") or "") or "",
        "mail_from_name": (cfg.get("mail_from_name") or "") or "",
        "mail_use_tls": bool(cfg.get("mail_use_tls") if cfg.get("mail_use_tls") is not None else port not in (25, 465)),
        "mail_username": (cfg.get("mail_username") or "") or "",
        "username_set": bool(cfg.get("mail_username")),
        "password_set": bool(cfg.get("mail_password")),
        "configured": configured,
    }


def update_smtp_config(payload: dict[str, Any]) -> dict[str, Any]:
    raw = _read_raw()
    for k in ("mail_server", "mail_port", "mail_username", "mail_password", "mail_from", "mail_from_name", "mail_use_tls"):
        if k in payload and payload[k] is not None:
            raw[k] = payload[k]
    _write_raw(raw)
    return smtp_status()


_LOCAL_SMTP_ALIASES = frozenset(
    {"host.docker.internal", "localhost", "127.0.0.1", "172.17.0.1", "172.18.0.1"}
)


def _in_docker() -> bool:
    return os.path.isfile("/.dockerenv")


def _public_site_host() -> str:
    for raw in (getattr(settings, "frontend_url", None), os.environ.get("FRONTEND_URL")):
        host = urlparse((raw or "").strip()).hostname
        if host:
            return host.lower()
    return ""


def _looks_like_self_hosted_mail(host: str) -> bool:
    h = (host or "").strip().lower().rstrip(".")
    if not h or h in _LOCAL_SMTP_ALIASES:
        return False
    site = _public_site_host()
    if not site:
        return h.startswith("mail.")
    return h == site or h.endswith("." + site)


def smtp_connect_hosts(ui_host: str) -> list[str]:
    """TCP hosts to try. UI hostname stays the public name; Docker often cannot hairpin to it."""
    host = (ui_host or "").strip()
    ordered: list[str] = []
    override = (os.environ.get("MAIL_CONNECT_HOST") or "").strip()
    env_server = (settings.mail_server or "").strip()
    self_hosted = _looks_like_self_hosted_mail(host)

    def add(value: str) -> None:
        value = (value or "").strip()
        if value and value not in ordered:
            ordered.append(value)

    if self_hosted:
        add(override)
        # Documented Plesk workaround: MAIL_SERVER=host.docker.internal in .env.
        # Super Admin UI is source of truth for credentials, but that host is still
        # the right TCP target from inside the backend container.
        if env_server.lower() in _LOCAL_SMTP_ALIASES:
            add(env_server)
    add(host)
    if _in_docker() and self_hosted:
        add("host.docker.internal")
        add("172.17.0.1")
    return ordered


def _is_connect_level_error(exc: BaseException) -> bool:
    if isinstance(exc, ssl.SSLCertVerificationError):
        return False
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return False
    if isinstance(exc, (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused, smtplib.SMTPDataError)):
        return False
    return isinstance(
        exc,
        (
            socket.timeout,
            TimeoutError,
            socket.gaierror,
            ConnectionError,
            OSError,
            smtplib.SMTPConnectError,
            smtplib.SMTPServerDisconnected,
            smtplib.SMTPHeloError,
        ),
    )


def _open_smtp_socket(
    tcp_host: str,
    sni_host: str,
    port: int,
    use_tls: bool,
    timeout: float,
) -> smtplib.SMTP:
    ctx = ssl.create_default_context()
    if port == 465:
        server = smtplib.SMTP_SSL(context=ctx, timeout=timeout)
        server._host = sni_host
        server.connect(tcp_host, port)
        return server
    server = smtplib.SMTP(timeout=timeout)
    server._host = sni_host
    server.connect(tcp_host, port)
    if use_tls:
        server.starttls(context=ctx)
    return server


def open_smtp(cfg: dict[str, Any]) -> smtplib.SMTP:
    """Connect + TLS. Login is left to the caller. Retries Docker host-gateway on hairpin failures."""
    ui_host = (cfg.get("mail_server") or "").strip()
    port = int(cfg.get("mail_port") or 0)
    use_tls = cfg.get("mail_use_tls")
    if use_tls is None:
        use_tls = port not in (25, 465)
    use_tls = bool(use_tls)
    hosts = smtp_connect_hosts(ui_host)
    last_exc: BaseException | None = None
    for i, tcp_host in enumerate(hosts):
        remaining = i + 1 < len(hosts)
        timeout = 5 if remaining else _SMTP_TIMEOUT
        try:
            logger.info("SMTP connect tcp=%s sni=%s port=%s tls=%s", tcp_host, ui_host, port, use_tls)
            return _open_smtp_socket(tcp_host, ui_host, port, use_tls, timeout)
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "SMTP connect failed tcp=%s:%s type=%s",
                tcp_host,
                port,
                type(exc).__name__,
            )
            if remaining and _is_connect_level_error(exc):
                continue
            raise
    assert last_exc is not None
    raise last_exc


def send_with_config(cfg: dict[str, Any], to_email: str, subject: str, body: str) -> None:
    mail_from = (cfg.get("mail_from") or cfg.get("mail_username") or "").strip()
    from_name = (cfg.get("mail_from_name") or "ControlOps").strip()
    username = cfg.get("mail_username") or ""
    password = cfg.get("mail_password") or ""
    msg = MIMEMultipart()
    msg["From"] = f"{from_name} <{mail_from}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html"))
    server = None
    try:
        server = open_smtp(cfg)
        if username and password:
            server.login(username, password)
        server.send_message(msg)
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass


def _safe_smtp_error(
    exc: BaseException,
    host: str | None = None,
    port: int | None = None,
) -> tuple[int, str, str]:
    """Map SMTP failures to safe user-facing codes. Never include credentials.

    Always use 4xx so reverse proxies / Cloudflare do not replace the JSON body
    with a generic 502 HTML page ("API server is temporarily unavailable").
    """
    name = type(exc).__name__
    smtp_code = getattr(exc, "smtp_code", None)
    suffix = f" (SMTP {smtp_code})" if isinstance(smtp_code, int) else ""
    where = f" {host}:{port}" if host else ""
    logger.warning("SMTP failure type=%s smtp_code=%s host=%s port=%s", name, smtp_code, host, port)

    # ssl.SSLError is an OSError — classify TLS before the generic network bucket.
    if isinstance(exc, ssl.SSLCertVerificationError):
        return (
            400,
            "tls_error",
            f"The SMTP TLS certificate could not be verified for{where or ' the mail host'}. "
            "Check the server hostname.",
        )
    if isinstance(exc, ssl.SSLError) or "ssl" in name.lower() or "tls" in name.lower():
        reason = getattr(exc, "reason", None) or str(exc)
        reason_s = reason.decode("utf-8", "replace") if isinstance(reason, bytes) else str(reason)
        if "WRONG_VERSION_NUMBER" in reason_s.upper() or "WRONG_VERSION_NUMBER" in name:
            return (
                400,
                "tls_error",
                f"Port{where or ''} is not speaking SSL. Use 465 with STARTTLS off, or 587 with STARTTLS on.",
            )
        return 400, "tls_error", f"TLS/SSL handshake failed{where}. Check port and STARTTLS/SSL settings."
    if isinstance(exc, socket.gaierror):
        return 400, "invalid_host", f"SMTP host could not be resolved{where}. Check the server hostname."
    if isinstance(exc, (socket.timeout, TimeoutError)):
        extra = (
            " If the API runs in Docker, it often cannot reach the public mail hostname — "
            "try port 587 with STARTTLS, or set MAIL_CONNECT_HOST=host.docker.internal."
            if _in_docker()
            else ""
        )
        return (
            400,
            "connection_timeout",
            f"Could not reach the SMTP server{where} in time. Check host, port, and firewall.{extra}",
        )
    if isinstance(exc, ConnectionRefusedError):
        return 400, "connection_refused", f"SMTP connection was refused{where}. Check host and port."
    if isinstance(exc, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)):
        return (
            400,
            "connection_failed",
            f"SMTP connection was reset{where}. Check port and TLS/SSL (465 SSL vs 587 STARTTLS).",
        )
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return 400, "auth_failed", f"SMTP authentication failed. Check the username and password.{suffix}"
    if isinstance(exc, smtplib.SMTPConnectError):
        return 400, "connection_failed", f"Could not connect to the SMTP server{where}. Check host, port, and TLS/SSL settings.{suffix}"
    if isinstance(exc, (smtplib.SMTPServerDisconnected, smtplib.SMTPHeloError)):
        return 400, "connection_failed", f"SMTP connection dropped{where}. Check host, port, and TLS/SSL settings.{suffix}"
    if isinstance(exc, smtplib.SMTPNotSupportedError):
        return 400, "tls_error", "SMTP server rejected the TLS/SSL configuration. Try a different port or TLS setting."
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return 400, "invalid_recipient", "The SMTP server rejected the recipient address."
    if isinstance(exc, smtplib.SMTPSenderRefused):
        return 400, "invalid_sender", "The SMTP server rejected the From address."
    if isinstance(exc, smtplib.SMTPDataError):
        return 400, "send_failed", f"SMTP accepted the connection but rejected the message.{suffix}"
    if isinstance(exc, OSError):
        err = getattr(exc, "errno", None)
        hint = ""
        if err in {errno.ETIMEDOUT, getattr(errno, "ETIME", errno.ETIMEDOUT)}:
            hint = " Connection timed out."
        elif err in (errno.EHOSTUNREACH, errno.ENETUNREACH):
            hint = " Host or network is unreachable from the API server."
        elif err == errno.ECONNRESET:
            hint = " The connection was reset."
        extra = (
            " If the API runs in Docker, set MAIL_CONNECT_HOST=host.docker.internal or try port 587 with STARTTLS."
            if _in_docker()
            else " Check host, port, and that the API server can reach the mail host."
        )
        return 400, "connection_failed", f"Could not reach the SMTP server{where}.{hint}{extra}"
    return 400, "smtp_error", f"SMTP could not send the email ({name}). Check server, port, TLS, and credentials.{suffix}"


def test_smtp_connection(to_email: str) -> dict[str, Any]:
    """Validate SMTP connection + auth, then send a test message. No secrets in response."""
    recipient = (to_email or "").strip().lower()
    if not recipient or "@" not in recipient:
        raise HTTPException(status_code=400, detail={"code": "invalid_recipient", "message": "Enter a valid test recipient email."})
    cfg = get_smtp_config()
    host = (cfg.get("mail_server") or "").strip()
    port = int(cfg.get("mail_port") or 0)
    username = cfg.get("mail_username") or ""
    password = cfg.get("mail_password") or ""
    mail_from = (cfg.get("mail_from") or username or "").strip()
    if not host:
        raise HTTPException(status_code=400, detail={"code": "invalid_host", "message": "SMTP server host is required."})
    if port < 1 or port > 65535:
        raise HTTPException(status_code=400, detail={"code": "invalid_port", "message": "SMTP port must be between 1 and 65535."})
    if not username or not password:
        raise HTTPException(status_code=400, detail={"code": "missing_credentials", "message": "SMTP username and password must be configured before testing."})
    if not mail_from:
        raise HTTPException(status_code=400, detail={"code": "invalid_sender", "message": "From email is required."})

    try:
        send_with_config(
            cfg,
            recipient,
            "ControlOps SMTP test",
            "<p>This is a test email from ControlOps Super Admin SMTP settings.</p>"
            "<p>If you received this message, platform SMTP is connected and authenticated correctly.</p>",
        )
    except HTTPException:
        raise
    except Exception as exc:
        status, code, message = _safe_smtp_error(exc, host=host, port=port)
        raise HTTPException(status_code=status, detail={"code": code, "message": message}) from None

    return {
        "ok": True,
        "code": "sent",
        "message": f"SMTP connection succeeded and a test email was sent to {recipient}.",
        "mail_server": host,
        "mail_port": port,
    }
