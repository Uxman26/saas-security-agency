from fastapi.testclient import TestClient

from app.auth import get_password_hash
from app.models import Company, User
from app.services.role_service import ensure_roles_for_company


def _seed(session, email: str) -> None:
    u = User(
        email=email,
        password_hash=get_password_hash("secret"),
        full_name="T",
        role="company_admin",
    )
    session.add(u)
    session.flush()
    co = Company(name="Co", admin_id=u.id, subscription_tier="premium")
    session.add(co)
    session.flush()
    u.company_id = co.id
    ensure_roles_for_company(session, co.id)
    session.commit()


def _login(client: TestClient, email: str) -> str:
    r = client.post("/auth/login", json={"email": email, "password": "secret"})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_guard_create_full_profile(session, client: TestClient):
    _seed(session, "gprof@test.com")
    tok = _login(client, "gprof@test.com")
    h = {"Authorization": f"Bearer {tok}"}
    mc = client.post("/contractors", json={"name": "DirMain", "type": "main"}, headers=h)
    assert mc.status_code == 201
    cid = mc.json()["id"]
    body = {
        "first_name": "Rehman",
        "last_name": "Khan",
        "email": "mighty@gmail.com",
        "employment_start_date": "2024-01-15",
        "holiday_jurisdiction": "england_wales",
        "employee_type": "fixed",
        "working_time_pattern": "mon_fri_9_5",
        "entitlement_unit": "hours",
        "contractor_id": cid,
        "contracted_week_hrs": 37,
        "contracted_week_mins": 30,
        "tax_code": "1257L",
        "ni_number": "AB123456C",
    }
    gr = client.post("/guards", json=body, headers=h)
    assert gr.status_code == 201, gr.text
    j = gr.json()
    assert j["full_name"] == "Rehman Khan"
    assert j["holiday_jurisdiction"] == "england_wales"
    assert j["employee_type"] == "fixed"
    assert j["weekly_contracted_hours"] == 37.5
    assert j["contractor_id"] == cid


def test_guard_update_preserves_contractor_when_omitted(session, client: TestClient):
    _seed(session, "gupd@test.com")
    tok = _login(client, "gupd@test.com")
    h = {"Authorization": f"Bearer {tok}"}
    mc = client.post("/contractors", json={"name": "DirMain2", "type": "main"}, headers=h)
    cid = mc.json()["id"]
    cr = client.post(
        "/guards",
        json={
            "full_name": "G Upd",
            "contractor_id": cid,
            "weekly_contracted_hours": 40,
        },
        headers=h,
    )
    assert cr.status_code == 201
    gid = cr.json()["id"]
    ur = client.put(
        f"/guards/{gid}",
        json={"full_name": "G Upd", "first_name": "G", "last_name": "Upd", "job_title": "Officer"},
        headers=h,
    )
    assert ur.status_code == 200, ur.text
    assert ur.json()["contractor_id"] == cid
    assert ur.json()["job_title"] == "Officer"
