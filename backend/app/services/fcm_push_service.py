"""FCM push delivery for ControlOps mobile device tokens.

Configured via env (any one of):
- FIREBASE_CREDENTIALS_JSON: path to service-account JSON, or raw JSON string
- GOOGLE_APPLICATION_CREDENTIALS: path to service-account JSON
- FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY

When credentials are missing, send helpers no-op (token registration still works).
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import MobileDeviceToken

logger = logging.getLogger(__name__)

_app = None
_init_attempted = False


def _credentials_dict() -> Optional[dict]:
    raw = (getattr(settings, "firebase_credentials_json", None) or "").strip()
    if raw:
        if raw.startswith("{"):
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("FIREBASE_CREDENTIALS_JSON is not valid JSON")
                return None
        try:
            with open(raw, "r", encoding="utf-8") as f:
                return json.load(f)
        except OSError as e:
            logger.warning("Could not read FIREBASE_CREDENTIALS_JSON path: %s", e)
            return None

    project_id = (getattr(settings, "firebase_project_id", None) or "").strip()
    client_email = (getattr(settings, "firebase_client_email", None) or "").strip()
    private_key = (getattr(settings, "firebase_private_key", None) or "").strip()
    if project_id and client_email and private_key:
        return {
            "type": "service_account",
            "project_id": project_id,
            "client_email": client_email,
            "private_key": private_key.replace("\\n", "\n"),
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    return None


def firebase_ready() -> bool:
    return _ensure_app() is not None


def _ensure_app():
    global _app, _init_attempted
    if _app is not None:
        return _app
    if _init_attempted:
        return None
    _init_attempted = True
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError:
        logger.info("firebase-admin not installed; FCM send disabled")
        return None

    if firebase_admin._apps:
        _app = firebase_admin.get_app()
        return _app

    creds = _credentials_dict()
    if creds:
        try:
            _app = firebase_admin.initialize_app(credentials.Certificate(creds))
            return _app
        except Exception as e:
            logger.warning("Firebase init from explicit credentials failed: %s", e)

    # ADC / GOOGLE_APPLICATION_CREDENTIALS
    try:
        _app = firebase_admin.initialize_app()
        return _app
    except Exception as e:
        logger.info("Firebase Admin not configured (%s); FCM send disabled", e)
        return None


def tokens_for_user(db: Session, user_id: int) -> list[MobileDeviceToken]:
    return (
        db.query(MobileDeviceToken)
        .filter(MobileDeviceToken.user_id == user_id)
        .order_by(MobileDeviceToken.updated_at.desc())
        .all()
    )


def send_to_user(
    db: Session,
    user_id: int,
    *,
    title: str,
    body: str,
    data: Optional[dict[str, Any]] = None,
) -> int:
    """Send a data+notification message to every registered token for this user.

    Returns number of successful sends. Never raises to callers.
    """
    if _ensure_app() is None:
        return 0
    rows = tokens_for_user(db, user_id)
    if not rows:
        return 0

    try:
        from firebase_admin import messaging
    except ImportError:
        return 0

    payload = {str(k): str(v) for k, v in (data or {}).items() if v is not None}
    payload.setdefault("title", title)
    payload.setdefault("body", body)

    tokens = [r.fcm_token for r in rows if r.fcm_token]
    if not tokens:
        return 0

    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        data=payload,
        tokens=tokens,
        android=messaging.AndroidConfig(priority="high"),
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(aps=messaging.Aps(sound="default", badge=1))
        ),
    )

    try:
        response = messaging.send_each_for_multicast(message)
    except Exception as e:
        logger.warning("FCM multicast failed: %s", e)
        return 0

    # Drop invalid / unregistered tokens in-session only — never commit here.
    # Callers (patrol sweep, messaging, rota) own the surrounding transaction;
    # committing mid-sweep previously flushed half-applied reminder/miss state.
    for idx, send_resp in enumerate(response.responses):
        if send_resp.success:
            continue
        err = send_resp.exception
        code = getattr(getattr(err, "code", None), "name", None) or str(err)
        if any(x in code for x in ("UNREGISTERED", "INVALID_ARGUMENT", "NOT_FOUND", "registration-token-not-registered")):
            token = tokens[idx]
            db.query(MobileDeviceToken).filter(MobileDeviceToken.fcm_token == token).delete(
                synchronize_session=False
            )

    return int(getattr(response, "success_count", 0) or 0)


def notify_after_app_notification(
    db: Session,
    *,
    user_id: int,
    notification_id: Optional[int],
    kind: str,
    title: str,
    body: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
) -> None:
    send_to_user(
        db,
        user_id,
        title=title,
        body=body or "",
        data={
            "type": kind,
            "notification_id": notification_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
        },
    )
