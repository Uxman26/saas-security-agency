"""Granular per-action permissions: catalogue integrity, migration and enforcement."""

import re
import pathlib

import pytest

from app.models import Company, Role, RoleModuleAction, User
from app.module_actions import MODULE_ACTIONS, action_keys_for_module, parent_chain
from app.rbac import permission_bypass, user_has_permission_db
from app.rbac_matrix import wrap_matrix
from app.services.module_service import (
    MODULE_SEED,
    backfill_role_module_permissions,
    ensure_app_modules,
    matrix_from_role_permissions,
    module_permission_codes_for_role,
    sync_role_permissions_from_matrix,
)
from app.services.role_service import ensure_roles_for_company

ROUTERS = pathlib.Path(__file__).resolve().parent.parent / "app" / "routers"
GUARD_RE = re.compile(r'require_module\(\s*"([a-z_]+)"\s*,\s*"([a-z_]+)"\s*\)')


def test_every_router_guard_exists_in_the_catalogue():
    """A typo in require_module would create a permission no role can ever hold."""
    unknown = []
    for path in ROUTERS.glob("*.py"):
        for module_key, action in GUARD_RE.findall(path.read_text()):
            if module_key not in MODULE_ACTIONS:
                unknown.append(f"{path.name}: unknown module {module_key!r}")
            elif action not in action_keys_for_module(module_key):
                unknown.append(f"{path.name}: {module_key}.{action} not in catalogue")
    assert unknown == []


def test_catalogue_matches_the_seeded_modules():
    assert set(MODULE_ACTIONS) == {key for key, *_ in MODULE_SEED}


def test_every_parent_chain_terminates():
    for module_key, actions in MODULE_ACTIONS.items():
        for action in actions:
            chain = parent_chain(module_key, action.key)
            assert len(chain) < 8, f"{module_key}.{action.key} chain looks cyclic"
            for ancestor in chain:
                assert ancestor in action_keys_for_module(module_key)


@pytest.fixture
def company(session):
    admin = User(
        email="owner@test.com",
        password_hash="x",
        full_name="Owner",
        role="company_admin",
        email_verified=True,
    )
    session.add(admin)
    session.commit()
    co = Company(name="Acme", admin_id=admin.id)
    session.add(co)
    session.commit()
    admin.company_id = co.id
    session.commit()
    ensure_app_modules(session)
    ensure_roles_for_company(session, co.id)
    session.commit()
    return co


def _coarse_role(session, company, cell):
    role = Role(
        company_id=company.id,
        name="Scheduler",
        slug="scheduler",
        is_system=False,
        permissions_json=wrap_matrix({"rota": cell}),
    )
    session.add(role)
    session.commit()
    # Simulate a role stored before granular permissions existed.
    session.query(RoleModuleAction).filter(RoleModuleAction.role_id == role.id).delete()
    session.commit()
    return role


def test_migration_grants_special_actions_from_their_parent(session, company):
    """Nobody loses access on the deploy that introduces granular actions."""
    role = _coarse_role(
        session, company, {"view": True, "create": True, "edit": True, "delete": False}
    )
    backfill_role_module_permissions(session)

    codes = module_permission_codes_for_role(session, role.id)
    assert "rota.publish" in codes  # inherits edit
    assert "rota.unpublish" in codes
    assert "rota.copy_plan" in codes  # inherits create
    assert "rota.export" in codes  # inherits view
    assert "rota.delete" not in codes


def test_unticking_a_special_action_survives_a_restart(session, company):
    role = _coarse_role(
        session, company, {"view": True, "create": True, "edit": True, "delete": False}
    )
    backfill_role_module_permissions(session)

    matrix = matrix_from_role_permissions(session, role)
    matrix["rota"]["publish"] = False
    sync_role_permissions_from_matrix(session, role, matrix)
    session.commit()

    backfill_role_module_permissions(session)

    codes = module_permission_codes_for_role(session, role.id)
    assert "rota.edit" in codes
    assert "rota.publish" not in codes


def test_an_explicit_no_beats_parent_inheritance(session, company):
    """rota.edit must not hand back a publish permission that was deliberately removed."""
    role = _coarse_role(
        session, company, {"view": True, "create": True, "edit": True, "delete": False}
    )
    backfill_role_module_permissions(session)
    matrix = matrix_from_role_permissions(session, role)
    matrix["rota"]["publish"] = False
    sync_role_permissions_from_matrix(session, role, matrix)
    session.commit()

    user = User(
        email="sched@test.com",
        password_hash="x",
        full_name="S",
        role=role.slug,
        company_id=company.id,
        role_id=role.id,
        email_verified=True,
    )
    session.add(user)
    session.commit()

    assert user_has_permission_db(session, user, "rota.edit") is True
    assert user_has_permission_db(session, user, "rota.unpublish") is True
    assert user_has_permission_db(session, user, "rota.publish") is False


def test_a_custom_role_never_bypasses_permission_checks(session, company):
    """User.role holds the role's slug, which must not resolve to company_admin."""
    role = _coarse_role(session, company, {"view": True, "create": False, "edit": False, "delete": False})
    backfill_role_module_permissions(session)
    user = User(
        email="viewer@test.com",
        password_hash="x",
        full_name="V",
        role=role.slug,
        company_id=company.id,
        role_id=role.id,
        email_verified=True,
    )
    session.add(user)
    session.commit()

    assert permission_bypass(session, user) is False
    assert user_has_permission_db(session, user, "rota.view") is True
    assert user_has_permission_db(session, user, "rota.edit") is False
    assert user_has_permission_db(session, user, "invoices.view") is False
    assert user_has_permission_db(session, user, "roles.users_create") is False


def test_admin_role_still_bypasses(session, company):
    admin_role = (
        session.query(Role).filter(Role.company_id == company.id, Role.slug == "admin").first()
    )
    user = User(
        email="a2@test.com",
        password_hash="x",
        full_name="A",
        role="admin",
        company_id=company.id,
        role_id=admin_role.id,
        email_verified=True,
    )
    session.add(user)
    session.commit()

    assert permission_bypass(session, user) is True
    assert user_has_permission_db(session, user, "rota.publish") is True


def test_legacy_permission_codes_still_expand(session, company):
    """The PERM_* bridge that services still read must survive the granular rewrite."""
    role = _coarse_role(
        session, company, {"view": True, "create": True, "edit": True, "delete": False}
    )
    backfill_role_module_permissions(session)

    codes = module_permission_codes_for_role(session, role.id)
    assert "assign.read" in codes
    assert "assign.write" in codes
    assert "attend.read" in codes


def test_approve_reject_still_yield_the_review_code(session, company):
    """staff_requests has no `edit` action, but approve/reject descend from it."""
    role = Role(
        company_id=company.id,
        name="Reviewer",
        slug="reviewer",
        is_system=False,
        permissions_json=wrap_matrix(
            {"staff_requests": {"view": True, "create": False, "edit": True, "delete": False}}
        ),
    )
    session.add(role)
    session.commit()
    session.query(RoleModuleAction).filter(RoleModuleAction.role_id == role.id).delete()
    session.commit()
    backfill_role_module_permissions(session)

    codes = module_permission_codes_for_role(session, role.id)
    assert "staff_requests.approve" in codes
    assert "staff_requests.reject" in codes
    assert "staff_req.review" in codes
