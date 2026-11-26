"""Phone-or-email login identifier validation (UserLogin schema)."""

from pydantic import ValidationError

from app.schemas import UserLogin
from app.services.auth_service import _looks_like_phone_identifier


def test_user_login_accepts_phone():
    body = UserLogin(company_id="CO7K2M9QP4", email="07700900123", password="Password1!")
    assert body.email == "447700900123@phone-login.controlops.co.uk"


def test_user_login_accepts_email():
    body = UserLogin(company_id="CO7K2M9QP4", email="Guard@Example.com", password="Password1!")
    assert body.email == "guard@example.com"


def test_user_login_rejects_short_junk():
    try:
        UserLogin(company_id="CO7K2M9QP4", email="12345", password="Password1!")
        assert False, "expected ValidationError"
    except ValidationError:
        pass


def test_phone_identifier_helper():
    assert _looks_like_phone_identifier("+44 7700 900123")
    assert not _looks_like_phone_identifier("user@example.com")
