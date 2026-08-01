from fastapi.testclient import TestClient

from app.auth import get_password_hash
from app.models import Company, Contractor, ContractorKind, User
from app.services.role_service import ensure_roles_for_company


def _seed_user_company(session, email: str, tier: str, role: str) -> tuple[User, Company]:
    u = User(
        email=email,
        password_hash=get_password_hash("secret"),
        full_name="T",
        role=role,
        email_verified=True,
    )
    session.add(u)
    session.flush()
    co = Company(name="Co", admin_id=u.id, subscription_tier=tier, subscription_status="active")
    session.add(co)
    session.flush()
    u.company_id = co.id
    ensure_roles_for_company(session, co.id)
    session.commit()
    session.refresh(u)
    session.refresh(co)
    return u, co


def _login(client: TestClient, email: str) -> str:
    r = client.post("/auth/login", json={"email": email, "password": "secret"})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_create_contractor_duplicate(session, client):
    _seed_user_company(session, "a@test.com", "premium", "company_admin")
    tok = _login(client, "a@test.com")
    h = {"Authorization": f"Bearer {tok}"}

    r = client.post("/contractors", json={"name": "MainCo", "type": "main"}, headers=h)
    assert r.status_code == 201

    r2 = client.post("/contractors", json={"name": "MainCo", "type": "main"}, headers=h)
    assert r2.status_code == 409

    r3 = client.post("/contractors", json={"name": "Other", "type": "main"}, headers=h)
    assert r3.status_code == 201


def test_assignment_cross_company_duplicate(session, client):
    _seed_user_company(session, "c1@test.com", "enterprise", "company_admin")
    _, co2 = _seed_user_company(session, "c2@test.com", "enterprise", "company_admin")

    other = Contractor(company_id=co2.id, name="OM", type=ContractorKind.main, is_active=True)
    session.add(other)
    session.commit()
    session.refresh(other)
    oid = str(other.id)

    tok = _login(client, "c1@test.com")
    h = {"Authorization": f"Bearer {tok}"}

    main = client.post("/contractors", json={"name": "M", "type": "main"}, headers=h)
    sub = client.post("/contractors", json={"name": "S", "type": "sub"}, headers=h)
    assert main.status_code == 201 and sub.status_code == 201
    mid = main.json()["id"]
    sid = sub.json()["id"]

    bad = client.post(
        "/contractors/assignments",
        json={"main_contractor_id": oid, "sub_contractor_id": sid},
        headers=h,
    )
    assert bad.status_code == 422

    ok = client.post(
        "/contractors/assignments",
        json={"main_contractor_id": mid, "sub_contractor_id": sid},
        headers=h,
    )
    assert ok.status_code == 201

    dup = client.post(
        "/contractors/assignments",
        json={"main_contractor_id": mid, "sub_contractor_id": sid},
        headers=h,
    )
    assert dup.status_code == 409


def test_manager_assign_not_manage(session, client):
    _, co = _seed_user_company(session, "adm@test.com", "enterprise", "company_admin")
    mgr = User(
        email="mgr@test.com",
        password_hash=get_password_hash("secret"),
        full_name="M",
        role="manager",
        company_id=co.id,
        email_verified=True,
    )
    session.add(mgr)
    session.commit()

    ta = _login(client, "adm@test.com")
    ha = {"Authorization": f"Bearer {ta}"}
    main = client.post("/contractors", json={"name": "M1", "type": "main"}, headers=ha)
    sub = client.post("/contractors", json={"name": "S1", "type": "sub"}, headers=ha)
    mid = main.json()["id"]
    sid = sub.json()["id"]

    tm = _login(client, "mgr@test.com")
    hm = {"Authorization": f"Bearer {tm}"}

    assert client.post("/contractors", json={"name": "Nope", "type": "main"}, headers=hm).status_code == 403

    assert (
        client.post(
            "/contractors/assignments",
            json={"main_contractor_id": mid, "sub_contractor_id": sid},
            headers=hm,
        ).status_code
        == 201
    )


def test_supervisor_cannot_assign(session, client):
    _, co = _seed_user_company(session, "adm2@test.com", "enterprise", "company_admin")
    sup = User(
        email="sup@test.com",
        password_hash=get_password_hash("secret"),
        full_name="S",
        role="supervisor",
        company_id=co.id,
        email_verified=True,
    )
    session.add(sup)
    session.commit()

    ta = _login(client, "adm2@test.com")
    ha = {"Authorization": f"Bearer {ta}"}
    main = client.post("/contractors", json={"name": "M2", "type": "main"}, headers=ha)
    sub = client.post("/contractors", json={"name": "S2", "type": "sub"}, headers=ha)
    mid = main.json()["id"]
    sid = sub.json()["id"]

    ts = _login(client, "sup@test.com")
    hs = {"Authorization": f"Bearer {ts}"}

    assert (
        client.post(
            "/contractors/assignments",
            json={"main_contractor_id": mid, "sub_contractor_id": sid},
            headers=hs,
        ).status_code
        == 403
    )
