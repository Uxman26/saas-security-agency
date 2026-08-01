from fastapi.testclient import TestClient

from app.auth import get_password_hash
from app.models import Company, User
from app.services.role_service import ensure_roles_for_company


def _seed(session, email: str) -> tuple[User, Company]:
    u = User(
        email=email,
        password_hash=get_password_hash("secret"),
        full_name="T",
        role="company_admin",
        email_verified=True,
    )
    session.add(u)
    session.flush()
    co = Company(name="Co", admin_id=u.id, subscription_tier="premium", subscription_status="active")
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


def test_guard_create_with_directory_contractor(session, client: TestClient):
    _seed(session, "gdir@test.com")
    tok = _login(client, "gdir@test.com")
    h = {"Authorization": f"Bearer {tok}"}
    mc = client.post("/contractors", json={"name": "DirMain", "type": "main"}, headers=h)
    assert mc.status_code == 201
    cid = mc.json()["id"]
    gr = client.post(
        "/guards",
        json={
            "full_name": "G1",
            "contractor_id": cid,
            "weekly_contracted_hours": 40,
        },
        headers=h,
    )
    assert gr.status_code == 201, gr.text
    assert gr.json().get("contractor_id") == cid
    assert gr.json().get("main_contractor_id") in (None, 0)


def test_guard_reject_mixed_contractor_refs(session, client: TestClient):
    _seed(session, "gmix@test.com")
    tok = _login(client, "gmix@test.com")
    h = {"Authorization": f"Bearer {tok}"}
    mc = client.post("/contractors", json={"name": "M2", "type": "main"}, headers=h)
    cid = mc.json()["id"]
    gr = client.post(
        "/guards",
        json={
            "full_name": "Bad",
            "contractor_id": cid,
            "main_contractor_id": 1,
            "weekly_contracted_hours": 40,
        },
        headers=h,
    )
    assert gr.status_code == 400
