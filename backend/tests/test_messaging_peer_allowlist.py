from fastapi import HTTPException
import pytest

from app.services import portal_messaging_service as pms
from app.services.portal_access import is_client_portal_user, is_staff_portal_user


class _Role:
    def __init__(self, slug):
        self.slug = slug


class _U:
    def __init__(self, role, active=True, uid=1):
        self.id = uid
        self.role = role
        self.role_row = _Role(role)
        self.is_active = active
        self.full_name = role
        self.email = f"{role}@example.com"


@pytest.fixture(autouse=True)
def _company_ok(monkeypatch):
    monkeypatch.setattr(pms.membership_service, "belongs_to_company", lambda *a, **k: True)
    monkeypatch.setattr(pms, "staff_authorized_peer_ids", lambda db, staff, cid: {10})


def test_staff_cannot_message_client():
    with pytest.raises(HTTPException) as exc:
        pms._assert_messaging_peer_allowed(None, _U("staff", uid=1), _U("client", uid=2), 1)
    assert exc.value.status_code == 403


def test_client_cannot_message_staff():
    with pytest.raises(HTTPException) as exc:
        pms._assert_messaging_peer_allowed(None, _U("client", uid=1), _U("staff", uid=2), 1)
    assert exc.value.status_code == 403


def test_client_can_message_admin():
    pms._assert_messaging_peer_allowed(None, _U("client", uid=1), _U("admin", uid=10), 1)


def test_staff_can_message_assigned_admin():
    pms._assert_messaging_peer_allowed(None, _U("staff", uid=1), _U("admin", uid=10), 1)


def test_staff_cannot_message_other_staff():
    with pytest.raises(HTTPException) as exc:
        pms._assert_messaging_peer_allowed(None, _U("staff", uid=1), _U("guard", uid=3), 1)
    assert exc.value.status_code == 403


def test_staff_cannot_message_unassigned_ops():
    with pytest.raises(HTTPException) as exc:
        pms._assert_messaging_peer_allowed(None, _U("staff", uid=1), _U("admin", uid=99), 1)
    assert exc.value.status_code == 403


def test_admin_can_message_anyone_active():
    pms._assert_messaging_peer_allowed(None, _U("admin", uid=10), _U("client", uid=2), 1)
    pms._assert_messaging_peer_allowed(None, _U("admin", uid=10), _U("staff", uid=1), 1)


def test_inactive_peer_rejected():
    with pytest.raises(HTTPException) as exc:
        pms._assert_messaging_peer_allowed(None, _U("admin", uid=10), _U("staff", uid=1, active=False), 1)
    assert exc.value.status_code == 404


def test_helpers_align():
    assert is_staff_portal_user(_U("guard")) is True
    assert is_client_portal_user(_U("client")) is True
