"""Live chat schedule, visitor intake, and Super Admin history."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app.auth import SUPER_ADMIN_ROLE, get_password_hash
from app.database import SessionLocal
from app.main import app
from app.models import LiveChatConversation, LiveSupportAgent, User
from app.services import live_support_service as svc


def _super_admin() -> tuple[str, str, int]:
    db = SessionLocal()
    try:
        email = "live.support.superadmin@example.com"
        password = "SuperAdmin1!"
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                full_name="Live Support Super Admin",
                password_hash=get_password_hash(password),
                role=SUPER_ADMIN_ROLE,
                company_id=None,
                is_active=True,
                email_verified=True,
                mfa_enabled=False,
            )
            db.add(user)
        else:
            user.password_hash = get_password_hash(password)
            user.role = SUPER_ADMIN_ROLE
            user.company_id = None
            user.is_active = True
            user.email_verified = True
            user.mfa_enabled = False
        db.commit()
        db.refresh(user)
        return email, password, user.id
    finally:
        db.close()


def _token() -> tuple[str, int]:
    email, password, uid = _super_admin()
    client = TestClient(app)
    res = client.post("/auth/login", json={"email": email, "password": password, "remember_me": True})
    assert res.status_code == 200, res.text
    return res.json()["access_token"], uid


def test_normalize_legacy_working_days():
    cfg = svc.normalize_availability(
        {
            "enabled": True,
            "timezone": "Europe/London",
            "working_days": [0, 2],
            "start_time": "10:00",
            "end_time": "16:00",
        }
    )
    assert cfg["days"]["0"]["enabled"] is True
    assert cfg["days"]["0"]["start"] == "10:00"
    assert cfg["days"]["1"]["enabled"] is False
    assert cfg["days"]["2"]["enabled"] is True
    assert cfg["working_days"] == [0, 2]


def test_per_day_hours_and_overnight():
    cfg = svc.normalize_availability(
        {
            "enabled": True,
            "timezone": "UTC",
            "days": {
                "0": {"enabled": True, "start": "09:00", "end": "17:00"},
                "1": {"enabled": False, "start": "09:00", "end": "17:00"},
                "4": {"enabled": True, "start": "22:00", "end": "06:00"},
            },
        }
    )
    db = SessionLocal()
    try:
        monday_open = datetime(2026, 10, 19, 12, 0, tzinfo=ZoneInfo("UTC"))  # Monday
        monday_closed = datetime(2026, 10, 19, 18, 0, tzinfo=ZoneInfo("UTC"))
        tuesday = datetime(2026, 10, 20, 12, 0, tzinfo=ZoneInfo("UTC"))
        friday_night = datetime(2026, 10, 23, 23, 30, tzinfo=ZoneInfo("UTC"))
        saturday_early = datetime(2026, 10, 24, 5, 0, tzinfo=ZoneInfo("UTC"))
        saturday_late = datetime(2026, 10, 24, 7, 0, tzinfo=ZoneInfo("UTC"))

        orig = svc.get_availability
        svc.get_availability = lambda _db: cfg  # type: ignore[method-assign]
        try:
            assert svc.is_within_hours(db, monday_open)[0] is True
            assert svc.is_within_hours(db, monday_closed)[0] is False
            assert svc.is_within_hours(db, tuesday)[0] is False
            assert svc.is_within_hours(db, friday_night)[0] is True
            assert svc.is_within_hours(db, saturday_early)[0] is True
            assert svc.is_within_hours(db, saturday_late)[0] is False
        finally:
            svc.get_availability = orig  # type: ignore[method-assign]
    finally:
        db.close()


def test_public_status_and_invalid_intake():
    client = TestClient(app)
    status = client.get("/live-support/status")
    assert status.status_code == 200, status.text
    body = status.json()
    assert "available" in body
    assert "within_hours" in body
    assert "days" in body
    bad = client.post(
        "/live-support/conversations",
        json={"full_name": "A", "email": "not-an-email", "company_name": "", "city": "X"},
    )
    assert bad.status_code == 422


def test_admin_schedule_requires_super_admin():
    client = TestClient(app)
    denied = client.get("/admin/live-support/availability")
    assert denied.status_code in (401, 403)
    token, _ = _token()
    headers = {"Authorization": f"Bearer {token}"}
    got = client.get("/admin/live-support/availability", headers=headers)
    assert got.status_code == 200, got.text
    previous = got.json()
    patched = client.patch(
        "/admin/live-support/availability",
        headers=headers,
        json={
            "enabled": True,
            "timezone": "Europe/London",
            "days": {
                str(i): {
                    "enabled": i < 7,
                    "start": "00:00",
                    "end": "23:59",
                }
                for i in range(7)
            },
            "offline_message": "We are closed.",
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["days"]["6"]["enabled"] is True
    assert patched.json()["timezone"] == "Europe/London"
    client.patch("/admin/live-support/availability", headers=headers, json=previous)


def test_conversation_flow_history_and_close():
    token, uid = _token()
    headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)
    db = SessionLocal()
    try:
        agent = db.query(LiveSupportAgent).filter(LiveSupportAgent.user_id == uid).first()
        if not agent:
            agent = LiveSupportAgent(user_id=uid, display_name="Queue Agent", is_available=True)
            db.add(agent)
        else:
            agent.is_available = True
            agent.display_name = "Queue Agent"
        db.commit()
    finally:
        db.close()

    previous = client.get("/admin/live-support/availability", headers=headers).json()
    client.patch(
        "/admin/live-support/availability",
        headers=headers,
        json={
            "enabled": True,
            "timezone": "UTC",
            "days": {str(i): {"enabled": True, "start": "00:00", "end": "23:59"} for i in range(7)},
        },
    )

    started = client.post(
        "/live-support/conversations",
        json={
            "full_name": "Ada Visitor",
            "email": "live.chat.audit.visitor@example.com",
            "company_name": "Visitor Co",
            "city": "Manchester",
            "initial_message": "Need a human",
        },
    )
    assert started.status_code == 200, started.text
    conv = started.json()
    assert conv["visitor_name"] == "Ada Visitor"
    assert conv["visitor_city"] == "Manchester"
    assert conv["public_id"]
    assert conv["visitor_token"]
    public_id = conv["public_id"]
    visitor_token = conv["visitor_token"]
    conv_id = conv["id"]

    missing_token = client.get(f"/live-support/conversations/{public_id}")
    assert missing_token.status_code == 404

    fetched = client.get(f"/live-support/conversations/{public_id}?token={visitor_token}")
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["visitor_company"] == "Visitor Co"

    sent = client.post(
        f"/live-support/conversations/{public_id}/messages",
        json={"body": "Hello agent", "visitor_token": visitor_token},
    )
    assert sent.status_code == 200, sent.text
    bodies = [m["body"] for m in sent.json()["messages"]]
    assert "Hello agent" in bodies

    inbox = client.get("/admin/live-support/conversations?status=inbox", headers=headers)
    assert inbox.status_code == 200, inbox.text
    assert any(item["id"] == conv_id for item in inbox.json()["items"])

    reply = client.post(
        f"/admin/live-support/conversations/{conv_id}/messages",
        headers=headers,
        json={"body": "We can help."},
    )
    assert reply.status_code == 200, reply.text

    closed = client.post(f"/admin/live-support/conversations/{conv_id}/close", headers=headers)
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "closed"
    assert closed.json()["visitor_email"] == "live.chat.audit.visitor@example.com"

    history = client.get(
        "/admin/live-support/conversations?status=closed&q=Ada Visitor",
        headers=headers,
    )
    assert history.status_code == 200, history.text
    assert any(item["id"] == conv_id for item in history.json()["items"])

    report = client.get("/admin/live-support/reports", headers=headers)
    assert report.status_code == 200, report.text
    assert "counts" in report.json()

    reopened = client.post(f"/admin/live-support/conversations/{conv_id}/reopen", headers=headers)
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["status"] in ("queued", "assigned", "active")
    assert reopened.json()["visitor_name"] == "Ada Visitor"

    db = SessionLocal()
    try:
        row = db.query(LiveChatConversation).filter(LiveChatConversation.id == conv_id).first()
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()
    client.patch("/admin/live-support/availability", headers=headers, json=previous)
