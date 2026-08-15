"""Back-office modules must refuse portal roles even when the matrix grants them.

Their services filter by company but not by client, so a Client login granted one of
these would read the whole tenant. require_internal_module keeps that out of reach of
the permission matrix.
"""

import pathlib
import re
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.auth import get_password_hash
from app.models import Client, Company, Invoice, Role, User
from app.rbac_matrix import default_matrix_admin, wrap_matrix
from app.services.module_service import sync_role_permissions_from_matrix
from app.services.role_service import ensure_roles_for_company, get_role_by_slug

ROUTERS = pathlib.Path(__file__).resolve().parent.parent / "app" / "routers"

# Modules a client or guard is legitimately meant to reach.
PORTAL_FACING = {"my_portal", "client_portal", "staff_requests", "incidents", "patrol", "sites", "invoices"}


def _seed(session):
    admin = User(email="admin@test.com", password_hash=get_password_hash("secret"),
                 full_name="Admin", role="company_admin", email_verified=True)
    session.add(admin)
    session.flush()
    co = Company(name="Co", admin_id=admin.id, subscription_tier="enterprise", subscription_status="active")
    session.add(co)
    session.flush()
    admin.company_id = co.id
    ensure_roles_for_company(session, co.id)
    session.commit()
    return co


def _client_role_with_everything(session, company_id: int) -> Role:
    """Worst case: someone ticks every box on the Client role."""
    role = get_role_by_slug(session, company_id, "client")
    matrix = default_matrix_admin()
    role.permissions_json = wrap_matrix(matrix)
    sync_role_permissions_from_matrix(session, role, matrix)
    session.commit()
    return role


def _portal_user(session, co, role, client_id=None, email="portal@test.com"):
    u = User(email=email, password_hash=get_password_hash("secret"), full_name="P",
             role="client", role_id=role.id, company_id=co.id, client_id=client_id,
             is_active=True, email_verified=True)
    session.add(u)
    session.commit()
    return u


def _login(client: TestClient, email: str) -> dict:
    r = client.post("/auth/login", json={"email": email, "password": "secret"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.parametrize(
    "path",
    ["/guards", "/clients", "/payroll", "/payments", "/expenses", "/allowances",
     "/leads", "/contractors", "/rates/guards/1", "/reports/dashboard", "/documents"],
)
def test_back_office_endpoints_refuse_a_fully_permissioned_client_login(session, client, path):
    co = _seed(session)
    role = _client_role_with_everything(session, co.id)
    cl = Client(company_id=co.id, name="Acme")
    session.add(cl)
    session.flush()
    _portal_user(session, co, role, client_id=cl.id)

    h = _login(client, "portal@test.com")
    r = client.get(path, headers=h)
    assert r.status_code == 403, f"{path} returned {r.status_code}, expected 403"


def test_admin_still_reaches_the_back_office(session, client):
    """The block must key on the portal role, not on the endpoint."""
    _seed(session)
    h = _login(client, "admin@test.com")
    for path in ("/guards", "/clients", "/payroll", "/expenses"):
        assert client.get(path, headers=h).status_code == 200, path


def test_a_client_sees_only_its_own_invoices(session, client):
    """Invoices stay reachable for clients, but scoped — the portal links to them."""
    co = _seed(session)
    role = _client_role_with_everything(session, co.id)
    mine = Client(company_id=co.id, name="Acme")
    theirs = Client(company_id=co.id, name="Rival")
    session.add_all([mine, theirs])
    session.flush()
    session.add_all([
        Invoice(company_id=co.id, client_id=mine.id, period_start=date(2026, 1, 1),
                period_end=date(2026, 1, 31), status="draft"),
        Invoice(company_id=co.id, client_id=theirs.id, period_start=date(2026, 1, 1),
                period_end=date(2026, 1, 31), status="draft"),
    ])
    session.commit()
    _portal_user(session, co, role, client_id=mine.id)

    h = _login(client, "portal@test.com")
    r = client.get("/invoices", headers=h)
    assert r.status_code == 200, r.text
    assert {i["client_id"] for i in r.json()} == {mine.id}


def test_a_client_cannot_write_invoices(session, client):
    co = _seed(session)
    role = _client_role_with_everything(session, co.id)
    cl = Client(company_id=co.id, name="Acme")
    session.add(cl)
    session.flush()
    _portal_user(session, co, role, client_id=cl.id)

    h = _login(client, "portal@test.com")
    r = client.post("/invoices", json={"client_id": cl.id, "period_start": "2026-01-01", "period_end": "2026-01-31"}, headers=h)
    assert r.status_code == 403


def test_no_back_office_router_slipped_back_to_require_module():
    """Guards against a future edit quietly reopening one of these routers."""
    internal = [
        "guards", "clients", "payroll", "payments", "expenses", "allowances", "leads",
        "contractors", "sub_contractors", "main_contractors", "rates", "special_days",
        "reports", "company", "billing", "subscriptions", "sms", "email", "documents",
    ]
    offenders = []
    for name in internal:
        path = ROUTERS / f"{name}.py"
        if not path.exists():
            continue
        if re.search(r'(?<!internal_)require_module\(', path.read_text()):
            offenders.append(name)
    assert offenders == [], f"back-office routers using plain require_module: {offenders}"
