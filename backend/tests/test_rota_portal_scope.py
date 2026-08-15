"""Rota endpoints must narrow to a portal login's own sites.

/rota/detail, /rota/summary and /rota/export take client_id and site_id straight from
the query string, so without scoping inside rota_service a Client login that has been
granted the Rota module would read every shift in the company.
"""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth import get_password_hash
from app.models import Assignment, Client, Company, Guard, Role, Site, User, UserSite
from app.rbac_matrix import wrap_matrix, default_matrix_client_portal
from app.services.module_service import sync_role_permissions_from_matrix
from app.services.role_service import ensure_roles_for_company, get_role_by_slug

TODAY = date.today()


def _seed(session):
    admin = User(
        email="admin@test.com",
        password_hash=get_password_hash("secret"),
        full_name="Admin",
        role="company_admin",
        email_verified=True,
    )
    session.add(admin)
    session.flush()
    co = Company(name="Co", admin_id=admin.id, subscription_tier="enterprise", subscription_status="active")
    session.add(co)
    session.flush()
    admin.company_id = co.id
    ensure_roles_for_company(session, co.id)
    session.commit()

    # Two clients, so we can prove one cannot read the other's shifts.
    acme = Client(company_id=co.id, name="Acme")
    rival = Client(company_id=co.id, name="Rival")
    session.add_all([acme, rival])
    session.flush()

    watford = Site(company_id=co.id, client_id=acme.id, name="Watford", site_type=1)
    enfield = Site(company_id=co.id, client_id=acme.id, name="Enfield", site_type=1)
    rival_site = Site(company_id=co.id, client_id=rival.id, name="RivalSite", site_type=1)
    session.add_all([watford, enfield, rival_site])
    session.flush()

    guard = Guard(company_id=co.id, full_name="Guard One", email="g1@test.com")
    session.add(guard)
    session.flush()

    for site in (watford, enfield, rival_site):
        session.add(
            Assignment(
                guard_id=guard.id,
                site_id=site.id,
                date=TODAY,
                shift_start="09:00",
                shift_end="17:00",
                shift_type="day",
            )
        )
    session.commit()
    return co, acme, watford, enfield, rival_site


def _grant_rota_to_client_role(session, company_id: int) -> Role:
    """Simulate an admin ticking the Rota module on for the Client role."""
    role = get_role_by_slug(session, company_id, "client")
    matrix = default_matrix_client_portal()
    matrix["rota"] = {"view": True, "create": False, "edit": False, "delete": False}
    role.permissions_json = wrap_matrix(matrix)
    sync_role_permissions_from_matrix(session, role, matrix)
    session.commit()
    return role


def _portal_user(session, company_id, client_id, role, email, pins=None):
    u = User(
        email=email,
        password_hash=get_password_hash("secret"),
        full_name="Portal User",
        role="client",
        role_id=role.id,
        company_id=company_id,
        client_id=client_id,
        is_active=True,
        email_verified=True,
    )
    session.add(u)
    session.flush()
    for sid in pins or []:
        session.add(UserSite(user_id=u.id, site_id=sid, company_id=company_id))
    session.commit()
    return u


def _login(client: TestClient, email: str) -> dict:
    r = client.post("/auth/login", json={"email": email, "password": "secret"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _detail(client, headers, **params):
    q = {"start_date": str(TODAY - timedelta(days=1)), "end_date": str(TODAY + timedelta(days=1)), **params}
    r = client.get("/assignments/rota/detail", params=q, headers=headers)
    assert r.status_code == 200, r.text
    return {row["site_name"] for row in r.json()}


def test_client_rota_detail_is_limited_to_its_own_client(session, client):
    co, acme, watford, enfield, rival_site = _seed(session)
    role = _grant_rota_to_client_role(session, co.id)
    _portal_user(session, co.id, acme.id, role, "portal@test.com")

    h = _login(client, "portal@test.com")
    assert _detail(client, h) == {"Watford", "Enfield"}


def test_client_cannot_read_another_clients_shifts_via_client_id(session, client):
    """Passing someone else's client_id must not widen the result."""
    co, acme, watford, enfield, rival_site = _seed(session)
    role = _grant_rota_to_client_role(session, co.id)
    rival_client_id = session.query(Client).filter(Client.name == "Rival").first().id
    _portal_user(session, co.id, acme.id, role, "portal@test.com")

    h = _login(client, "portal@test.com")
    assert _detail(client, h, client_id=rival_client_id) == set()


def test_pinned_client_rota_detail_shows_only_the_pinned_site(session, client):
    co, acme, watford, enfield, rival_site = _seed(session)
    role = _grant_rota_to_client_role(session, co.id)
    _portal_user(session, co.id, acme.id, role, "portal@test.com", pins=[watford.id])

    h = _login(client, "portal@test.com")
    assert _detail(client, h) == {"Watford"}


def test_pinned_client_cannot_read_a_sibling_site_via_site_id(session, client):
    co, acme, watford, enfield, rival_site = _seed(session)
    role = _grant_rota_to_client_role(session, co.id)
    _portal_user(session, co.id, acme.id, role, "portal@test.com", pins=[watford.id])

    h = _login(client, "portal@test.com")
    assert _detail(client, h, site_id=enfield.id) == set()


def test_rota_summary_is_scoped_too(session, client):
    """rota_summary delegates to list_rota_details, so it must inherit the narrowing."""
    co, acme, watford, enfield, rival_site = _seed(session)
    role = _grant_rota_to_client_role(session, co.id)
    _portal_user(session, co.id, acme.id, role, "portal@test.com", pins=[watford.id])

    h = _login(client, "portal@test.com")
    r = client.get(
        "/assignments/rota/summary",
        params={"start_date": str(TODAY - timedelta(days=1)), "end_date": str(TODAY + timedelta(days=1))},
        headers=h,
    )
    assert r.status_code == 200, r.text
    # One guard, but only the Watford shift should count toward the hours.
    assert sum(row["total_hours"] for row in r.json()) == 8.0


def test_admin_still_sees_the_whole_rota(session, client):
    """The narrowing must apply to portal roles only."""
    co, acme, watford, enfield, rival_site = _seed(session)

    h = _login(client, "admin@test.com")
    assert _detail(client, h) == {"Watford", "Enfield", "RivalSite"}


def test_portal_roles_cannot_open_the_internal_rota_planner(session, client):
    """planner_data spans every employee and site and cannot be sliced per client."""
    co, acme, watford, enfield, rival_site = _seed(session)
    role = _grant_rota_to_client_role(session, co.id)
    _portal_user(session, co.id, acme.id, role, "portal@test.com", pins=[watford.id])

    h = _login(client, "portal@test.com")
    assert client.get("/rotas", headers=h).status_code == 403


def test_admin_can_still_open_the_rota_planner(session, client):
    _seed(session)
    h = _login(client, "admin@test.com")
    assert client.get("/rotas", headers=h).status_code == 200


def test_client_login_is_never_told_guard_pay(session):
    """Clients see the shifts on their sites but must not learn what guards earn."""
    from app.services import portal_service

    co, acme, watford, enfield, rival_site = _seed(session)
    role = _grant_rota_to_client_role(session, co.id)
    user = _portal_user(session, co.id, acme.id, role, "portal@test.com", pins=[watford.id])

    out = portal_service.portal_hours(session, user, "week")
    assert out.total_pay is None
