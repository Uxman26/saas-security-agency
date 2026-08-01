"""Regression tests for the confirmed findings of the manual security test pass.

Each test here fails against the code as it was before the corresponding fix, so a
regression re-opens a named hole rather than silently passing.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth import (
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    get_password_hash,
)
from app.models import AppModule, Client, Company, Guard, Role, RoleModulePermission, Site, User
from app.services.role_service import ensure_roles_for_company

PASSWORD = "Str0ng!pass1"


def seed_company(session, email: str, *, role: str = "company_admin", tier: str = "enterprise"):
    """A verified, active user owning a company — the state a real tenant is in."""
    u = User(
        email=email,
        password_hash=get_password_hash(PASSWORD),
        full_name="Test User",
        role=role,
        email_verified=True,
        is_active=True,
    )
    session.add(u)
    session.flush()
    co = Company(name=f"Co {email}", admin_id=u.id, subscription_tier=tier, subscription_status="active")
    session.add(co)
    session.flush()
    u.company_id = co.id
    ensure_roles_for_company(session, co.id)
    session.commit()
    session.refresh(u)
    session.refresh(co)
    return u, co


def login(client: TestClient, email: str, password: str = PASSWORD) -> str:
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- CRITICAL: token type confusion --------------------------------------------------


def test_password_reset_token_is_not_an_access_token(session, client):
    """A reset token must not authenticate an API call.

    Before the fix get_current_user ignored the `type` claim, so a reset token — and a
    24h email-verification token, which travels in a URL — authenticated as its user.
    """
    user, _ = seed_company(session, "reset@test.com")
    reset_token = create_password_reset_token(user.id)

    r = client.get("/auth/me", headers=auth(reset_token))
    assert r.status_code == 401, f"reset token was accepted as an access token: {r.text}"


def test_email_verification_token_is_not_an_access_token(session, client):
    user, _ = seed_company(session, "verify@test.com")
    verify_token = create_email_verification_token(user.id)

    r = client.get("/auth/me", headers=auth(verify_token))
    assert r.status_code == 401, f"verification token was accepted as an access token: {r.text}"


def test_real_access_token_still_works(session, client):
    """The type check must not lock out legitimate callers."""
    seed_company(session, "ok@test.com")
    token = login(client, "ok@test.com")
    r = client.get("/auth/me", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["email"] == "ok@test.com"


def test_expired_access_token_rejected(session, client):
    user, _ = seed_company(session, "expired@test.com")
    stale = create_access_token({"sub": user.id}, expires_delta=timedelta(seconds=-60))
    r = client.get("/auth/me", headers=auth(stale))
    assert r.status_code == 401


def test_unsigned_and_garbage_tokens_rejected(session, client):
    seed_company(session, "garbage@test.com")
    for bad in ["", "not-a-jwt", "Bearer", "a.b.c"]:
        r = client.get("/auth/me", headers=auth(bad))
        assert r.status_code == 401, f"token {bad!r} was accepted"


# --- CRITICAL: SQL-style payloads and login input validation -------------------------

SQLI_PAYLOADS = [
    "' OR 1=1 --",
    "' OR '1'='1",
    "admin'--",
    "'; DROP TABLE users; --",
    "' UNION SELECT NULL, NULL --",
    "1' AND SLEEP(5)--",
]


@pytest.mark.parametrize("payload", SQLI_PAYLOADS)
def test_sqli_payload_in_email_is_rejected(session, client, payload):
    """SQL-shaped input is not a valid address, so it is rejected before any query."""
    seed_company(session, "sqli@test.com")
    r = client.post("/auth/login", json={"email": payload, "password": PASSWORD})
    assert r.status_code == 422, f"{payload!r} was not rejected as invalid: {r.status_code}"


@pytest.mark.parametrize("payload", SQLI_PAYLOADS)
def test_sqli_payload_in_password_does_not_authenticate(session, client, payload):
    """A SQL payload in the password field must be an ordinary failed login.

    Passwords legitimately contain quotes and semicolons, so we do not ban those
    characters. What matters is that the payload cannot alter the query: it comes back
    as a plain 401 and the account is untouched.
    """
    seed_company(session, "sqli2@test.com")
    r = client.post("/auth/login", json={"email": "sqli2@test.com", "password": payload})
    assert r.status_code == 401

    assert login(client, "sqli2@test.com"), "account must still be usable afterwards"


def test_login_rejects_whitespace_only_password(session, client):
    seed_company(session, "ws@test.com")
    for blank in ["   ", "\t", "\n", ""]:
        r = client.post("/auth/login", json={"email": "ws@test.com", "password": blank})
        assert r.status_code == 422, f"whitespace password {blank!r} was accepted"


def test_login_rejects_whitespace_only_email(session, client):
    seed_company(session, "ws2@test.com")
    r = client.post("/auth/login", json={"email": "   ", "password": PASSWORD})
    assert r.status_code == 422


def test_login_enforces_field_length_limits(session, client):
    """Oversized fields are refused before bcrypt runs, so they cost us nothing."""
    seed_company(session, "len@test.com")

    long_password = client.post(
        "/auth/login", json={"email": "len@test.com", "password": "z" * 500}
    )
    assert long_password.status_code == 422

    long_email = client.post(
        "/auth/login", json={"email": "z" * 300 + "@test.com", "password": PASSWORD}
    )
    assert long_email.status_code == 422


def test_login_rejects_unknown_fields(session, client):
    """Payload tampering must be refused, not silently discarded."""
    seed_company(session, "extra@test.com")
    r = client.post(
        "/auth/login",
        json={
            "email": "extra@test.com",
            "password": PASSWORD,
            "role": "super_admin",
            "company_id": 1,
            "is_active": True,
        },
    )
    assert r.status_code == 422, "tampered login payload was accepted"


# --- CRITICAL: IDOR / URL manipulation ----------------------------------------------


def _seed_guard(session, company_id: int, name: str = "Their Guard") -> Guard:
    g = Guard(company_id=company_id, full_name=name, email=f"{name.replace(' ', '')}@g.com")
    session.add(g)
    session.commit()
    session.refresh(g)
    return g


def _seed_site(session, company_id: int, name: str = "Their Site") -> Site:
    s = Site(company_id=company_id, name=name, address="1 Road", postcode="AB1 2CD")
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


def test_cannot_read_another_tenants_guard_by_id(session, client):
    seed_company(session, "tenant-a@test.com")
    _, co_b = seed_company(session, "tenant-b@test.com")
    victim = _seed_guard(session, co_b.id)

    token = login(client, "tenant-a@test.com")
    r = client.get(f"/guards/{victim.id}", headers=auth(token))
    assert r.status_code == 404, f"leaked another tenant's guard: {r.text}"


def test_cannot_modify_another_tenants_guard_by_id(session, client):
    seed_company(session, "tenant-c@test.com")
    _, co_d = seed_company(session, "tenant-d@test.com")
    victim = _seed_guard(session, co_d.id, "Victim Guard")

    token = login(client, "tenant-c@test.com")

    upd = client.put(f"/guards/{victim.id}", json={"full_name": "Hacked"}, headers=auth(token))
    assert upd.status_code == 404

    dele = client.delete(f"/guards/{victim.id}", headers=auth(token))
    assert dele.status_code == 404

    session.refresh(victim)
    assert victim.full_name == "Victim Guard", "cross-tenant write succeeded"


def test_cannot_read_another_tenants_site_by_id(session, client):
    seed_company(session, "tenant-e@test.com")
    _, co_f = seed_company(session, "tenant-f@test.com")
    victim = _seed_site(session, co_f.id)

    token = login(client, "tenant-e@test.com")
    r = client.get(f"/sites/{victim.id}", headers=auth(token))
    assert r.status_code == 404


def test_cannot_read_another_tenants_user_by_id(session, client):
    seed_company(session, "tenant-g@test.com")
    other, _ = seed_company(session, "tenant-h@test.com")

    token = login(client, "tenant-g@test.com")
    r = client.get(f"/users/{other.id}", headers=auth(token))
    assert r.status_code == 404, "leaked a user record from another tenant"


def test_nonexistent_id_and_foreign_id_are_indistinguishable(session, client):
    """A 403 on a foreign id would confirm the record exists. Both must be 404."""
    seed_company(session, "tenant-i@test.com")
    _, co_j = seed_company(session, "tenant-j@test.com")
    foreign = _seed_guard(session, co_j.id, "Hidden Guard")

    token = login(client, "tenant-i@test.com")
    foreign_resp = client.get(f"/guards/{foreign.id}", headers=auth(token))
    missing_resp = client.get("/guards/98765", headers=auth(token))
    assert foreign_resp.status_code == missing_resp.status_code == 404


# --- CRITICAL: cross-tenant foreign keys in request bodies --------------------------


def test_cannot_attach_another_tenants_guard_to_an_invoice_line(session, client):
    """Planting a foreign guard_id disclosed that guard's name back via guard_name."""
    _, co_a = seed_company(session, "inv-a@test.com")
    _, co_b = seed_company(session, "inv-b@test.com")
    foreign_guard = _seed_guard(session, co_b.id, "Foreign Guard")
    own_site = _seed_site(session, co_a.id, "Own Site")

    own_client = Client(company_id=co_a.id, name="Own Client", email="client@a.com")
    session.add(own_client)
    session.commit()
    session.refresh(own_client)

    token = login(client, "inv-a@test.com")
    inv = client.post(
        "/invoices",
        json={
            "client_id": own_client.id,
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            "due_date": "2026-02-28",
        },
        headers=auth(token),
    )
    assert inv.status_code in (200, 201), inv.text

    r = client.post(
        f"/invoices/{inv.json()['id']}/lines",
        json={"site_id": own_site.id, "guard_id": foreign_guard.id, "hours": 1, "rate": 10},
        headers=auth(token),
    )
    assert r.status_code == 422, f"accepted a cross-tenant guard_id: {r.text}"

    ok = client.post(
        f"/invoices/{inv.json()['id']}/lines",
        json={"site_id": own_site.id, "guard_id": None, "hours": 1, "rate": 10},
        headers=auth(token),
    )
    assert ok.status_code in (200, 201), f"fix broke a legitimate invoice line: {ok.text}"


def test_cannot_assign_a_lead_to_a_user_in_another_company(session, client):
    """Assigning across tenants posted a notification with the lead title into their feed."""
    seed_company(session, "lead-a@test.com")
    outsider, _ = seed_company(session, "lead-b@test.com")

    token = login(client, "lead-a@test.com")
    r = client.post(
        "/leads",
        json={"organization": "Acme", "assigned_user_id": outsider.id},
        headers=auth(token),
    )
    assert r.status_code == 422, f"accepted a cross-tenant assigned_user_id: {r.text}"


# --- CRITICAL: global platform table must not be tenant-editable --------------------


def test_role_editor_cannot_mutate_the_global_module_registry(session, client):
    """AppModule has no company_id, so an edit here reaches every tenant.

    The exposure was a non-admin custom role granted `roles.edit`: that was enough to
    rename or deactivate a module platform-wide, and deactivating one strips the
    corresponding permission from every company. POST /modules already required an
    admin; PATCH did not.
    """
    _, co = seed_company(session, "mod-admin@test.com")

    roles_module = session.query(AppModule).filter(AppModule.key == "roles").first()
    assert roles_module is not None, "module registry was not seeded"

    editor_role = Role(company_id=co.id, name="Role Editor", slug="role_editor", is_system=False)
    session.add(editor_role)
    session.flush()
    session.add(
        RoleModulePermission(
            role_id=editor_role.id,
            module_id=roles_module.id,
            can_view=True,
            can_edit=True,
        )
    )
    member = User(
        email="mod-editor@test.com",
        password_hash=get_password_hash(PASSWORD),
        full_name="Role Editor",
        role="staff",
        company_id=co.id,
        role_id=editor_role.id,
        email_verified=True,
        is_active=True,
    )
    session.add(member)
    session.commit()

    admin_token = login(client, "mod-admin@test.com")
    modules = client.get("/modules", headers=auth(admin_token))
    assert modules.status_code == 200
    target = next(m for m in modules.json() if m["key"] == "rota")

    member_token = login(client, "mod-editor@test.com")
    r = client.patch(
        f"/modules/{target['id']}",
        json={"is_active": False, "name": "Renamed platform-wide"},
        headers=auth(member_token),
    )
    assert r.status_code in (403, 404), f"a roles.edit holder mutated the global registry: {r.text}"

    session.expire_all()
    unchanged = session.query(AppModule).filter(AppModule.id == target["id"]).first()
    assert unchanged.is_active is True and unchanged.name != "Renamed platform-wide"


def test_module_update_rejects_unknown_fields(session, client):
    seed_company(session, "mod2@test.com")
    token = login(client, "mod2@test.com")
    module_id = client.get("/modules", headers=auth(token)).json()[0]["id"]

    r = client.patch(
        f"/modules/{module_id}",
        json={"name": "Fine", "key": "hijacked", "id": 999},
        headers=auth(token),
    )
    assert r.status_code == 422, "tampered module payload was accepted"


# --- CRITICAL: response payloads must not leak internal fields ----------------------


def test_uploads_directory_is_not_publicly_served(session, client):
    """The uploads directory used to be a public static mount.

    It holds guard documents, incident photos and patrol scans, so anyone with a path
    could read another tenant's files with no login at all. Nothing under /uploads may
    resolve, authenticated or not.
    """
    seed_company(session, "static@test.com")
    token = login(client, "static@test.com")

    for path in ("/uploads/", "/uploads/incidents/photo.avif", "/uploads/../app/config.py"):
        anon = client.get(path)
        assert anon.status_code == 404, f"{path} is publicly served ({anon.status_code})"
        signed_in = client.get(path, headers=auth(token))
        assert signed_in.status_code == 404, f"{path} is served to any signed-in user"


def test_incident_attachment_url_points_at_an_authenticated_endpoint(session, client):
    """The serialised URL must be an API route, not a raw file path."""
    _, co = seed_company(session, "att@test.com")
    site = _seed_site(session, co.id, "Att Site")

    token = login(client, "att@test.com")
    created = client.post(
        "/incidents",
        json={"site_id": site.id, "notes": "Broken window at the rear entrance"},
        headers=auth(token),
    )
    assert created.status_code in (200, 201), created.text

    detail = client.get(f"/incidents/{created.json()['id']}", headers=auth(token))
    assert detail.status_code == 200
    for att in detail.json().get("attachments") or []:
        assert not att["url"].startswith("/uploads/"), "attachment still points at the static mount"
        assert att["url"].startswith("/incidents/")


def test_incident_attachment_file_is_tenant_scoped(session, client):
    """Guessing an incident id from another tenant must not return their photo."""
    seed_company(session, "att-a@test.com")
    _, co_b = seed_company(session, "att-b@test.com")
    their_site = _seed_site(session, co_b.id, "Their Site")

    b_token = login(client, "att-b@test.com")
    theirs = client.post(
        "/incidents",
        json={"site_id": their_site.id, "notes": "Their private incident notes"},
        headers=auth(b_token),
    )
    assert theirs.status_code in (200, 201), theirs.text

    a_token = login(client, "att-a@test.com")
    r = client.get(f"/incidents/{theirs.json()['id']}/attachments/1/file", headers=auth(a_token))
    assert r.status_code == 404


def test_lead_document_upload_does_not_leak_server_path(session, client):
    seed_company(session, "doc@test.com")
    token = login(client, "doc@test.com")
    lead = client.post("/leads", json={"organization": "DocCo"}, headers=auth(token))
    assert lead.status_code in (200, 201), lead.text

    r = client.post(
        f"/leads/{lead.json()['id']}/documents",
        files={"file": ("note.txt", b"hello", "text/plain")},
        headers=auth(token),
    )
    assert r.status_code in (200, 201), r.text
    assert "file_path" not in r.json(), "upload response leaked the absolute server path"
    assert r.json()["file_name"] == "note.txt"
