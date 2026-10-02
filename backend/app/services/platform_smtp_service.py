import json
import os
import smtplib
import socket
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from fastapi import HTTPException

from app.config import settings

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
        if saved_creds:
            return raw.get(key)
        return raw.get(key) or fallback

    port = pick("mail_port", settings.mail_port)
    use_tls = raw.get("mail_use_tls")
    return {
        "mail_server": pick("mail_server", settings.mail_server),
        "mail_port": int(port or 587),
        "mail_use_tls": use_tls if use_tls is not None else settings.mail_use_tls,
        "mail_username": pick("mail_username", settings.mail_username),
        "mail_password": pick("mail_password", settings.mail_password),
        "mail_from": pick("mail_from", settings.mail_from),
        "mail_from_name": pick("mail_from_name", settings.mail_from_name),
    }


def smtp_status() -> dict[str, Any]:
    cfg = get_smtp_config()
    configured = bool(cfg["mail_username"] and cfg["mail_password"])
    return {
        "mail_server": cfg["mail_server"],
        "mail_port": cfg["mail_port"],
        "mail_from": cfg["mail_from"],
        "mail_from_name": cfg["mail_from_name"],
        "username_set": bool(cfg["mail_username"]),
        "password_set": bool(cfg["mail_password"]),
        "configured": configured,
    }


def update_smtp_config(payload: dict[str, Any]) -> dict[str, Any]:
    raw = _read_raw()
    for k in ("mail_server", "mail_port", "mail_username", "mail_password", "mail_from", "mail_from_name", "mail_use_tls"):
        if k in payload and payload[k] is not None:
            raw[k] = payload[k]
    _write_raw(raw)
    return smtp_status()


def _safe_smtp_error(exc: BaseException) -> tuple[int, str, str]:
    """Map SMTP failures to safe user-facing codes. Never include credentials."""
    name = type(exc).__name__
    if isinstance(exc, socket.gaierror):
        return 400, "invalid_host", "SMTP host could not be resolved. Check the server hostname."
    if isinstance(exc, (socket.timeout, TimeoutError)):
        return 504, "connection_timeout", "Could not reach the SMTP server in time. Check host, port, and firewall."
    if isinstance(exc, ConnectionRefusedError):
        return 502, "connection_refused", "SMTP connection was refused. Check host and port."
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return 401, "auth_failed", "SMTP authentication failed. Check the username and password."
    if isinstance(exc, smtplib.SMTPConnectError):
        return 502, "connection_failed", "Could not connect to the SMTP server. Check host, port, and TLS/SSL settings."
    if isinstance(exc, (smtplib.SMTPServerDisconnected, smtplib.SMTPHeloError)):
        return 502, "connection_failed", "SMTP connection dropped. Check host, port, and TLS/SSL settings."
    if isinstance(exc, smtplib.SMTPNotSupportedError):
        return 400, "tls_error", "SMTP server rejected the TLS/SSL configuration. Try a different port or TLS setting."
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return 400, "invalid_recipient", "The SMTP server rejected the recipient address."
    if isinstance(exc, smtplib.SMTPSenderRefused):
        return 400, "invalid_sender", "The SMTP server rejected the From address."
    if isinstance(exc, smtplib.SMTPDataError):
        return 502, "send_failed", "SMTP accepted the connection but rejected the message."
    if isinstance(exc, OSError):
        return 502, "connection_failed", "Network error while contacting the SMTP server. Check host and port."
    if "ssl" in name.lower() or "tls" in name.lower():
        return 400, "tls_error", "TLS/SSL configuration error. Check port and encryption settings."
    return 500, "smtp_error", "SMTP test failed. Check server settings and try again."


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
    from_name = (cfg.get("mail_from_name") or "ControlOps").strip()
    if not host:
        raise HTTPException(status_code=400, detail={"code": "invalid_host", "message": "SMTP server host is required."})
    if port < 1 or port > 65535:
        raise HTTPException(status_code=400, detail={"code": "invalid_port", "message": "SMTP port must be between 1 and 65535."})
    if not username or not password:
        raise HTTPException(status_code=400, detail={"code": "missing_credentials", "message": "SMTP username and password must be configured before testing."})
    if not mail_from:
        raise HTTPException(status_code=400, detail={"code": "invalid_sender", "message": "From email is required."})

    use_tls = cfg.get("mail_use_tls")
    if use_tls is None:
        use_tls = port not in (25, 465)
    use_tls = bool(use_tls)

    server = None
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=_SMTP_TIMEOUT)
        else:
            server = smtplib.SMTP(host, port, timeout=_SMTP_TIMEOUT)
            if use_tls:
                server.starttls()
        server.login(username, password)
        msg = MIMEMultipart()
        msg["From"] = f"{from_name} <{mail_from}>"
        msg["To"] = recipient
        msg["Subject"] = "ControlOps SMTP test"
        msg.attach(
            MIMEText(
                "<p>This is a test email from ControlOps Super Admin SMTP settings.</p>"
                "<p>If you received this message, platform SMTP is connected and authenticated correctly.</p>",
                "html",
            )
        )
        server.send_message(msg)
    except HTTPException:
        raise
    except Exception as exc:
        status, code, message = _safe_smtp_error(exc)
        raise HTTPException(status_code=status, detail={"code": code, "message": message}) from None
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass

    return {
        "ok": True,
        "code": "sent",
        "message": f"SMTP connection succeeded and a test email was sent to {recipient}.",
        "mail_server": host,
        "mail_port": port,
    }
