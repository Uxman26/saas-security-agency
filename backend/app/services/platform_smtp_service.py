import json
import os
from typing import Any

from app.config import settings

# Must live on the mounted data volume (/app/data, same place as the sqlite db),
# NOT app/data inside the image — settings written there are lost on every rebuild.
_DATA_DIR = os.environ.get("APP_DATA_DIR") or os.path.join(os.getcwd(), "data")
_SMTP_FILE = os.path.join(_DATA_DIR, "platform_smtp.json")


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
    for k in ("mail_server", "mail_port", "mail_username", "mail_password", "mail_from", "mail_from_name"):
        if k in payload and payload[k] is not None:
            raw[k] = payload[k]
    _write_raw(raw)
    return smtp_status()
