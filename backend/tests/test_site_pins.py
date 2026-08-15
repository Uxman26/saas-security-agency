"""Site-pinned portal logins.

The central guarantee is that an unpinned Client login keeps the pre-existing
client-wide scope, so deploying the pin table cannot silently narrow a live login,
while a pinned one is restricted to exactly the sites it was given.
"""

from fastapi.testclient import TestClient

from app.auth import get_password_hash
from app.models import Client, Company, Site, User, UserSite
from app.services.role_service import ensure_roles_for_company, get_role_by_slug


def _seed_company(session, email: str = "admin@test.com") -> tuple[User, Company]:
    u = User(
        email=email,
        password_hash=get_password_hash("secret"),
        full_name="Admin",
        role="company_admin",
        email_verified=True,
    )
    session.add(u)
    session.flush()
    co = Company(name="Co", admin_id=u.id, subscription_tier="enterprise", subscription_status="active")
    session.add(co)
    session.flush()
    u.company_id = co.id
    ensure_roles_for_company(session, co.id)
    session.commit()
    session.refresh(u)
    session.refresh(co)
    return u, co


def _seed_client_with_sites(session, company_id: int, names: list[str]) -> tuple[Client, list[Site]]:
    cl = Client(company_id=company_id, name="Acme")
    session.add(cl)
    session.flush()
    sites = []
    for n in names:
        s = Site(company_id=company_id, client_id=cl.id, name=n, site_type=1)
        session.add(s)
        sites.append(s)
    session.commit()
    for s in sites:
        session.refresh(s)
    session.refresh(cl)
    return cl, sites


def _make_portal_user(session, company_id: int, client_id: int, email: str, pins: list[int] | None = None) -> User:
    role = get_role_by_slug(session, company_id, "client")
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
    session.refresh(u)
    return u


def _login(client: TestClient, email: str, password: str = "secret") -> dict:
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _make_contractor(client: TestClient, headers: dict) -> str:
    """Every site needs a main or sub contractor, so tests that POST /sites need one."""
    r = client.post("/contractors", json={"name": "MainCo", "type": "main"}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _portal_site_names(client: TestClient, headers: dict) -> set:
    """The Client role has no sites.view, so portal users reach sites via /portal/sites."""
    r = client.get("/portal/sites", headers=headers)
    assert r.status_code == 200, r.text
    return {s["name"] for s in r.json()}


def test_unpinned_client_login_sees_every_site_of_its_client(session, client):
    """The backward-compatibility guarantee: no pins means the old, wider scope."""
    _, co = _seed_company(session)
    cl, sites = _seed_client_with_sites(session, co.id, ["Watford", "Enfield", "Barnet"])
    _make_portal_user(session, co.id, cl.id, "portal@test.com")

    h = _login(client, "portal@test.com")
    assert _portal_site_names(client, h) == {"Watford", "Enfield", "Barnet"}


def test_pinned_client_login_sees_only_its_pinned_sites(session, client):
    _, co = _seed_company(session)
    cl, sites = _seed_client_with_sites(session, co.id, ["Watford", "Enfield", "Barnet"])
    _make_portal_user(session, co.id, cl.id, "portal@test.com", pins=[sites[0].id])

    h = _login(client, "portal@test.com")
    assert _portal_site_names(client, h) == {"Watford"}


def test_portal_sites_endpoint_respects_pins(session, client):
    _, co = _seed_company(session)
    cl, sites = _seed_client_with_sites(session, co.id, ["Watford", "Enfield"])
    _make_portal_user(session, co.id, cl.id, "portal@test.com", pins=[sites[1].id])

    h = _login(client, "portal@test.com")
    r = client.get("/portal/sites", headers=h)
    assert r.status_code == 200, r.text
    assert {s["name"] for s in r.json()} == {"Enfield"}


def test_portal_rota_rejects_a_site_id_outside_the_pin(session, client):
    _, co = _seed_company(session)
    cl, sites = _seed_client_with_sites(session, co.id, ["Watford", "Enfield"])
    _make_portal_user(session, co.id, cl.id, "portal@test.com", pins=[sites[0].id])

    h = _login(client, "portal@test.com")
    assert client.get(f"/portal/rota/current?site_id={sites[0].id}", headers=h).status_code == 200
    # Same client, but not pinned to this login.
    assert client.get(f"/portal/rota/current?site_id={sites[1].id}", headers=h).status_code == 404


def test_creating_a_site_provisions_a_pinned_login(session, client):
    admin, co = _seed_company(session)
    cl, _ = _seed_client_with_sites(session, co.id, [])

    h = _login(client, "admin@test.com")
    contractor_id = _make_contractor(client, h)
    r = client.post(
        "/sites",
        json={
            "name": "Watford",
            "client_id": cl.id,
            "site_type": 1,
            "contractor_id": contractor_id,
            "create_login": True,
            "login_email": "manager@acme.com",
            "login_full_name": "Dave Smith",
            "login_password": "Str0ng!Passw0rd",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    site_id = r.json()["id"]

    created = session.query(User).filter(User.email == "manager@acme.com").first()
    assert created is not None
    assert created.client_id == cl.id
    pins = [p.site_id for p in session.query(UserSite).filter(UserSite.user_id == created.id).all()]
    assert pins == [site_id]


def test_a_site_with_no_client_still_gets_a_standalone_login(session, client):
    """Scenario: a site independent of any client."""
    _, co = _seed_company(session)

    h = _login(client, "admin@test.com")
    contractor_id = _make_contractor(client, h)
    r = client.post(
        "/sites",
        json={
            "name": "Standalone",
            "client_id": None,
            "site_type": 1,
            "contractor_id": contractor_id,
            "create_login": True,
            "login_email": "solo@site.com",
            "login_password": "Str0ng!Passw0rd",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text

    created = session.query(User).filter(User.email == "solo@site.com").first()
    assert created is not None
    assert created.client_id is None
    pins = [p.site_id for p in session.query(UserSite).filter(UserSite.user_id == created.id).all()]
    assert pins == [r.json()["id"]]


def test_a_standalone_site_login_sees_only_its_own_site(session, client):
    """The fail-closed guarantee: no client link must never mean "see everything"."""
    _, co = _seed_company(session)
    # Another client's sites exist and must stay invisible.
    _seed_client_with_sites(session, co.id, ["Watford", "Enfield"])

    h = _login(client, "admin@test.com")
    contractor_id = _make_contractor(client, h)
    r = client.post(
        "/sites",
        json={
            "name": "Standalone",
            "client_id": None,
            "site_type": 1,
            "contractor_id": contractor_id,
            "create_login": True,
            "login_email": "solo@site.com",
            "login_password": "Str0ng!Passw0rd",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text

    ph = _login(client, "solo@site.com", "Str0ng!Passw0rd")
    assert _portal_site_names(client, ph) == {"Standalone"}


def test_a_client_login_with_neither_client_nor_pins_sees_nothing(session, client):
    """Fail closed rather than falling through to an unfiltered query."""
    _, co = _seed_company(session)
    _seed_client_with_sites(session, co.id, ["Watford", "Enfield"])

    role = get_role_by_slug(session, co.id, "client")
    orphan = User(
        email="orphan@test.com",
        password_hash=get_password_hash("secret"),
        full_name="Orphan",
        role="client",
        role_id=role.id,
        company_id=co.id,
        client_id=None,
        is_active=True,
        email_verified=True,
    )
    session.add(orphan)
    session.commit()

    h = _login(client, "orphan@test.com")
    assert _portal_site_names(client, h) == set()


def test_a_login_cannot_be_created_with_neither_client_nor_sites(session, client):
    _, co = _seed_company(session)
    role = get_role_by_slug(session, co.id, "client")

    h = _login(client, "admin@test.com")
    r = client.post(
        "/users",
        json={
            "email": "nowhere@test.com",
            "password": "Str0ng!Passw0rd",
            "full_name": "Nowhere",
            "role_id": role.id,
        },
        headers=h,
    )
    assert r.status_code == 400, r.text


def test_create_login_is_rejected_on_edit(session, client):
    _, co = _seed_company(session)
    cl, sites = _seed_client_with_sites(session, co.id, ["Watford"])

    h = _login(client, "admin@test.com")
    contractor_id = _make_contractor(client, h)
    r = client.put(
        f"/sites/{sites[0].id}",
        json={
            "name": "Watford",
            "client_id": cl.id,
            "site_type": 1,
            "contractor_id": contractor_id,
            "create_login": True,
            "login_password": "Str0ng!Passw0rd",
        },
        headers=h,
    )
    assert r.status_code == 400
    assert "cannot be created from an edit" in r.json()["detail"]


def test_a_pin_cannot_point_at_another_clients_site(session, client):
    """Pins may only ever narrow, so the API must refuse a site outside the client."""
    _, co = _seed_company(session)
    cl_a, sites_a = _seed_client_with_sites(session, co.id, ["A-Site"])
    other = Client(company_id=co.id, name="Other")
    session.add(other)
    session.flush()
    foreign = Site(company_id=co.id, client_id=other.id, name="B-Site", site_type=1)
    session.add(foreign)
    session.commit()
    session.refresh(foreign)

    role = get_role_by_slug(session, co.id, "client")
    h = _login(client, "admin@test.com")
    r = client.post(
        "/users",
        json={
            "email": "pin@acme.com",
            "password": "Str0ng!Passw0rd",
            "full_name": "Pin User",
            "role_id": role.id,
            "client_id": cl_a.id,
            "site_ids": [foreign.id],
        },
        headers=h,
    )
    assert r.status_code == 400, r.text
    assert session.query(User).filter(User.email == "pin@acme.com").first() is None


def test_clearing_site_ids_restores_client_wide_access(session, client):
    _, co = _seed_company(session)
    cl, sites = _seed_client_with_sites(session, co.id, ["Watford", "Enfield"])
    u = _make_portal_user(session, co.id, cl.id, "portal@test.com", pins=[sites[0].id])

    h = _login(client, "admin@test.com")
    r = client.put(
        f"/users/{u.id}",
        json={"email": "portal@test.com", "full_name": "Portal User", "role_id": u.role_id, "site_ids": []},
        headers=h,
    )
    assert r.status_code == 200, r.text

    ph = _login(client, "portal@test.com")
    assert _portal_site_names(client, ph) == {"Watford", "Enfield"}
