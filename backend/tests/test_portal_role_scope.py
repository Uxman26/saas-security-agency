from app.services.portal_access import is_portal_role, is_staff_portal_user, role_slug


class _U:
    def __init__(self, role=None, slug=None):
        self.role = role
        self.role_row = type("R", (), {"slug": slug})() if slug is not None else None


def test_legacy_guard_is_staff_portal():
    u = _U(role="guard", slug="guard")
    assert role_slug(u) == "guard"
    assert is_staff_portal_user(u) is True
    assert is_portal_role(u) is True


def test_staff_is_staff_portal():
    u = _U(role="staff", slug="staff")
    assert is_staff_portal_user(u) is True
    assert is_portal_role(u) is True


def test_client_is_portal_not_staff():
    u = _U(role="client", slug="client")
    assert is_staff_portal_user(u) is False
    assert is_portal_role(u) is True


def test_admin_not_portal():
    u = _U(role="admin", slug="admin")
    assert is_staff_portal_user(u) is False
    assert is_portal_role(u) is False
