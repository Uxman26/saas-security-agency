from app.services.portal_messaging_service import _assert_messaging_peer_allowed
from app.services.portal_access import is_client_portal_user, is_staff_portal_user
from fastapi import HTTPException
import pytest


class _Role:
    def __init__(self, slug):
        self.slug = slug


class _U:
    def __init__(self, role, active=True):
        self.role = role
        self.role_row = _Role(role)
        self.is_active = active


def test_staff_cannot_message_client():
    with pytest.raises(HTTPException) as exc:
        _assert_messaging_peer_allowed(_U("staff"), _U("client"))
    assert exc.value.status_code == 403


def test_client_cannot_message_staff():
    with pytest.raises(HTTPException) as exc:
        _assert_messaging_peer_allowed(_U("client"), _U("staff"))
    assert exc.value.status_code == 403


def test_client_can_message_admin():
    _assert_messaging_peer_allowed(_U("client"), _U("admin"))


def test_staff_can_message_admin_and_staff():
    _assert_messaging_peer_allowed(_U("staff"), _U("admin"))
    _assert_messaging_peer_allowed(_U("staff"), _U("guard"))


def test_admin_can_message_anyone_active():
    _assert_messaging_peer_allowed(_U("admin"), _U("client"))
    _assert_messaging_peer_allowed(_U("admin"), _U("staff"))


def test_inactive_peer_rejected():
    with pytest.raises(HTTPException) as exc:
        _assert_messaging_peer_allowed(_U("admin"), _U("staff", active=False))
    assert exc.value.status_code == 404


def test_helpers_align():
    assert is_staff_portal_user(_U("guard")) is True
    assert is_client_portal_user(_U("client")) is True
