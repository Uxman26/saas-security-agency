import json
import os
from typing import Any

from app.config import settings

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
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
    raw = _read_raw()
    username = raw.get("mail_username") or settings.mail_username
    password = raw.get("mail_password") or settings.mail_password
    return {
        "mail_server": raw.get("mail_server") or settings.mail_server,
        "mail_port": int(raw.get("mail_port") or settings.mail_port),
        "mail_username": username,
        "mail_password": password,
        "mail_from": raw.get("mail_from") or settings.mail_from,
        "mail_from_name": raw.get("mail_from_name") or settings.mail_from_name,
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
