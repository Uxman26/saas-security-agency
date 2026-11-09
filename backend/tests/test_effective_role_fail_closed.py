from types import SimpleNamespace

from app.rbac import effective_role, user_has_permission


def test_unknown_legacy_role_string_does_not_become_company_admin():
    user = SimpleNamespace(role="site_controller", role_id=None)
    assert effective_role(user) == "unknown"
    assert not user_has_permission(user, "sites.read")
    assert not user_has_permission(user, "guards.read")


def test_blank_role_keeps_legacy_company_admin_default():
    user = SimpleNamespace(role=None, role_id=None)
    assert effective_role(user) == "company_admin"


def test_admin_alias_maps_to_company_admin():
    user = SimpleNamespace(role="admin", role_id=None)
    assert effective_role(user) == "company_admin"
    assert user_has_permission(user, "sites.read")


def test_known_staff_static_bag_is_not_empty():
    from app.rbac import PERM_PORTAL_ROTA_CURRENT

    user = SimpleNamespace(role="staff", role_id=None)
    assert effective_role(user) == "staff"
    assert user_has_permission(user, PERM_PORTAL_ROTA_CURRENT)
