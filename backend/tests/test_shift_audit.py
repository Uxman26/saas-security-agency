"""Shift History: the planner diff, the audit trail it writes, and who may read it."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth import get_password_hash
from app.middleware.client_source import classify
from app.models import Client, Company, Guard, Role, ShiftAuditLog, Site, User
from app.rbac_matrix import default_matrix_admin, wrap_matrix
from app.services import shift_audit_service
from app.services.module_service import ensure_app_modules, sync_role_permissions_from_matrix
from app.services.role_service import ensure_roles_for_company, get_role_by_slug


def _planner(shifts: dict, employees: list[dict] | None = None) -> dict:
    return {
        "rotaView": "table",
        "days": ["2026-08-10", "2026-08-11"],
        "employees": employees if employees is not None else [{"id": "1", "name": "Alex"}, {"id": "2", "name": "Sam"}],
        "shifts": shifts,
        "attendance": {},
        "budget": 0,
        "inclBreaks": False,
    }


def _block(start="09:00", end="17:00", site="The Hive", **extra) -> dict:
    return {"start": start, "end": end, "site": site, "notes": "", "breakH": 0, "breakM": 30, **extra}


# --- The diff engine -----------------------------------------------------------------


def test_a_new_shift_reads_as_created():
    events = shift_audit_service.diff_planner(
        _planner({}), _planner({"1": {"2026-08-10": [_block()]}})
    )
    assert [e["action"] for e in events] == ["shift_created"]
    assert events[0]["before"] is None
    assert events[0]["after"]["guard_name"] == "Alex"


def test_a_removed_shift_reads_as_deleted():
    events = shift_audit_service.diff_planner(
        _planner({"1": {"2026-08-10": [_block()]}}), _planner({})
    )
    assert [e["action"] for e in events] == ["shift_deleted"]
    assert events[0]["after"] is None


def test_an_unchanged_planner_produces_no_events():
    planner = _planner({"1": {"2026-08-10": [_block()], "2026-08-11": [_block("20:00", "08:00")]}})
    assert shift_audit_service.diff_planner(planner, planner) == []


def test_changing_the_hours_reads_as_a_timing_change_with_both_values():
    events = shift_audit_service.diff_planner(
        _planner({"1": {"2026-08-10": [_block("09:00", "17:00")]}}),
        _planner({"1": {"2026-08-10": [_block("10:00", "18:00")]}}),
    )
    assert [e["action"] for e in events] == ["shift_time_changed"]
    changes = shift_audit_service.diff_fields(events[0]["before"], events[0]["after"])
    assert {c["field"]: (c["from"], c["to"]) for c in changes} == {
        "start": ("09:00", "10:00"),
        "end": ("17:00", "18:00"),
    }


def test_moving_a_shift_to_another_member_of_staff_reads_as_a_reassignment():
    """Not a delete plus a create — the audit has to name both staff members."""
    events = shift_audit_service.diff_planner(
        _planner({"1": {"2026-08-10": [_block()]}}),
        _planner({"2": {"2026-08-10": [_block()]}}),
    )
    assert [e["action"] for e in events] == ["shift_reassigned"]
    assert events[0]["before"]["guard_name"] == "Alex"
    assert events[0]["after"]["guard_name"] == "Sam"


def test_moving_a_shift_to_another_day_reads_as_a_date_change():
    events = shift_audit_service.diff_planner(
        _planner({"1": {"2026-08-10": [_block()]}}),
        _planner({"1": {"2026-08-11": [_block()]}}),
    )
    assert [e["action"] for e in events] == ["shift_date_changed"]
    assert (events[0]["before"]["date"], events[0]["after"]["date"]) == ("2026-08-10", "2026-08-11")


def test_editing_the_site_or_rate_reads_as_an_update():
    events = shift_audit_service.diff_planner(
        _planner({"1": {"2026-08-10": [_block(site="The Hive", shiftRate=12.5)]}}),
        _planner({"1": {"2026-08-10": [_block(site="Montcalm Hotel", shiftRate=14.0)]}}),
    )
    assert [e["action"] for e in events] == ["shift_updated"]
    changes = {c["field"]: (c["from"], c["to"]) for c in shift_audit_service.diff_fields(events[0]["before"], events[0]["after"])}
    assert changes["site"] == ("The Hive", "Montcalm Hotel")
    assert changes["rate"] == (12.5, 14.0)


def test_one_edit_among_several_shifts_logs_only_that_shift():
    before = _planner({"1": {"2026-08-10": [_block("09:00", "17:00"), _block("18:00", "22:00")]}})
    after = _planner({"1": {"2026-08-10": [_block("09:00", "17:00"), _block("18:00", "23:00")]}})
    events = shift_audit_service.diff_planner(before, after)
    assert [e["action"] for e in events] == ["shift_time_changed"]
    assert events[0]["after"]["end"] == "23:00"


def test_a_shift_added_alongside_an_edit_is_reported_separately():
    before = _planner({"1": {"2026-08-10": [_block("09:00", "17:00")]}})
    after = _planner({
        "1": {"2026-08-10": [_block("09:00", "18:00")]},
        "2": {"2026-08-11": [_block("20:00", "08:00")]},
    })
    assert sorted(e["action"] for e in shift_audit_service.diff_planner(before, after)) == [
        "shift_created",
        "shift_time_changed",
    ]


# --- Client source -------------------------------------------------------------------


@pytest.mark.parametrize(
    "header,agent,expected",
    [
        ("mobile", "", "mobile"),
        ("ControlOps-Mobile", "", "mobile"),
        ("web", "", "web"),
        ("", "Mozilla/5.0 (Macintosh) Chrome/120", "web"),
        ("", "okhttp/4.9.0", "mobile"),
        ("", "ControlOps/2.1 (Android 14)", "mobile"),
        ("", "Dart/3.0 (dart:io)", "mobile"),
        ("", "", "api"),
    ],
)
def test_the_client_making_the_change_is_classified(header, agent, expected):
    assert classify(header, agent) == expected


# --- End to end through the API ------------------------------------------------------


def _seed(session):
    admin = User(
        email="admin@test.com",
        password_hash=get_password_hash("secret"),
        full_name="Ada Admin",
        role="company_admin",
        email_verified=True,
    )
    session.add(admin)
    session.flush()
    co = Company(name="Co", admin_id=admin.id, subscription_tier="enterprise", subscription_status="active")
    session.add(co)
    session.flush()
    admin.company_id = co.id
    ensure_app_modules(session)
    ensure_roles_for_company(session, co.id)
    guard = Guard(company_id=co.id, full_name="Alex Guard", email="alex@test.com")
    site = Site(company_id=co.id, name="The Hive", site_type=1)
    session.add_all([guard, site])
    session.commit()
    return co, guard, site


def _login(client: TestClient, email: str = "admin@test.com") -> dict:
    r = client.post("/auth/login", json={"email": email, "password": "secret"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _create_rota(client, headers, guard_id, planner_shifts):
    r = client.post(
        "/rotas",
        headers=headers,
        json={
            "name": "Weekly Rota",
            "start_date": "2026-08-10",
            "day_count": 2,
            "view_mode": "table",
            "budget": 0,
            "planner_data": __import__("json").dumps(
                _planner(planner_shifts, employees=[{"id": str(guard_id), "name": "Alex Guard"}])
            ),
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _patch_planner(client, headers, plan_id, guard_id, planner_shifts):
    r = client.patch(
        f"/rotas/{plan_id}",
        headers=headers,
        json={
            "planner_data": __import__("json").dumps(
                _planner(planner_shifts, employees=[{"id": str(guard_id), "name": "Alex Guard"}])
            )
        },
    )
    assert r.status_code == 200, r.text


def test_planner_edits_are_recorded_with_the_user_who_made_them(session, client):
    co, guard, site = _seed(session)
    h = _login(client)
    gid = str(guard.id)
    plan_id = _create_rota(client, h, guard.id, {gid: {"2026-08-10": [_block()]}})
    _patch_planner(client, h, plan_id, guard.id, {gid: {"2026-08-10": [_block("10:00", "18:00")]}})

    today = date.today().isoformat()
    r = client.get(f"/reports/shift-history?start_date={today}&end_date={today}", headers=h)
    assert r.status_code == 200, r.text
    rows = r.json()
    actions = [row["action"] for row in rows]
    assert "shift_created" in actions
    assert "shift_time_changed" in actions

    edit = next(row for row in rows if row["action"] == "shift_time_changed")
    assert edit["user"] == "Ada Admin"
    assert edit["user_email"] == "admin@test.com"
    assert edit["rota_name"] == "Weekly Rota"
    assert edit["site"] == "The Hive"
    assert edit["guard"] == "Alex Guard"
    assert edit["shift_date"] == "2026-08-10"
    assert edit["action_date"] == today
    assert edit["action_time"]
    assert "09:00" in edit["previous_values"] and "10:00" in edit["new_values"]
    assert {c["field"] for c in edit["changes"]} == {"start", "end"}


def test_a_deleted_shift_stays_in_the_history(session, client):
    co, guard, site = _seed(session)
    h = _login(client)
    gid = str(guard.id)
    plan_id = _create_rota(client, h, guard.id, {gid: {"2026-08-10": [_block()]}})
    _patch_planner(client, h, plan_id, guard.id, {})

    today = date.today().isoformat()
    rows = client.get(f"/reports/shift-history?start_date={today}&end_date={today}", headers=h).json()
    deleted = [row for row in rows if row["action"] == "shift_deleted"]
    assert len(deleted) == 1
    assert deleted[0]["guard"] == "Alex Guard"


def test_renaming_the_rota_is_recorded_as_a_rota_change(session, client):
    co, guard, site = _seed(session)
    h = _login(client)
    plan_id = _create_rota(client, h, guard.id, {str(guard.id): {"2026-08-10": [_block()]}})
    assert client.patch(f"/rotas/{plan_id}", headers=h, json={"name": "Renamed Rota"}).status_code == 200

    today = date.today().isoformat()
    rows = client.get(f"/reports/shift-history?start_date={today}&end_date={today}", headers=h).json()
    changed = [row for row in rows if row["action"] == "shift_rota_changed"]
    assert len(changed) == 1
    assert changed[0]["rota_name"] == "Renamed Rota"
    assert any(c["field"] == "rota_name" for c in changed[0]["changes"])


def test_the_date_filter_bounds_the_report(session, client):
    co, guard, site = _seed(session)
    h = _login(client)
    _create_rota(client, h, guard.id, {str(guard.id): {"2026-08-10": [_block()]}})

    today = date.today()
    past = (today - timedelta(days=30)).isoformat()
    yesterday = (today - timedelta(days=1)).isoformat()

    # A window that ends before today excludes it…
    assert client.get(f"/reports/shift-history?start_date={past}&end_date={yesterday}", headers=h).json() == []
    # …and one that ends on today includes it, last day and all.
    assert client.get(f"/reports/shift-history?start_date={past}&end_date={today.isoformat()}", headers=h).json()


def test_filters_narrow_the_report(session, client):
    co, guard, site = _seed(session)
    other = Guard(company_id=co.id, full_name="Sam Guard", email="sam@test.com")
    session.add(other)
    session.commit()
    h = _login(client)
    _create_rota(
        client,
        h,
        guard.id,
        {str(guard.id): {"2026-08-10": [_block()]}, str(other.id): {"2026-08-11": [_block()]}},
    )
    today = date.today().isoformat()

    rows = client.get(
        f"/reports/shift-history?start_date={today}&end_date={today}&guard_id={guard.id}", headers=h
    ).json()
    assert rows and {row["guard_id"] for row in rows} == {guard.id}

    rows = client.get(
        f"/reports/shift-history?start_date={today}&end_date={today}&action=shift_deleted", headers=h
    ).json()
    assert rows == []


def test_direct_assignment_changes_from_the_mobile_app_are_recorded(session, client):
    """The mobile app writes assignments straight through /assignments, not the planner."""
    co, guard, site = _seed(session)
    from app.models import MainContractor

    contractor = MainContractor(company_id=co.id, name="Prime")
    session.add(contractor)
    session.flush()
    guard.main_contractor_id = contractor.id
    site.main_contractor_id = contractor.id
    session.commit()

    h = {**_login(client), "X-Client-App": "mobile"}
    r = client.post(
        "/assignments",
        headers=h,
        json={
            "guard_id": guard.id,
            "site_id": site.id,
            "date": "2026-08-10",
            "shift_start": "09:00",
            "shift_end": "17:00",
            "break_minutes": 30,
            "shift_type": "day",
        },
    )
    assert r.status_code == 201, r.text
    assignment_id = r.json()["id"]

    r = client.put(
        f"/assignments/{assignment_id}",
        headers=h,
        json={
            "guard_id": guard.id,
            "site_id": site.id,
            "date": "2026-08-10",
            "shift_start": "11:00",
            "shift_end": "19:00",
            "break_minutes": 30,
            "shift_type": "day",
        },
    )
    assert r.status_code == 200, r.text

    today = date.today().isoformat()
    rows = client.get(f"/reports/shift-history?start_date={today}&end_date={today}", headers=h).json()
    by_action = {row["action"]: row for row in rows}
    assert "shift_assigned" in by_action
    assert "shift_time_changed" in by_action
    assert by_action["shift_assigned"]["source"] == "mobile"
    assert by_action["shift_time_changed"]["previous_values"].count("09:00") == 1


def test_history_is_isolated_between_tenants(session, client):
    co, guard, site = _seed(session)
    h = _login(client)
    _create_rota(client, h, guard.id, {str(guard.id): {"2026-08-10": [_block()]}})

    # A second company with its own admin must not see the first company's history.
    other_admin = User(
        email="other@test.com",
        password_hash=get_password_hash("secret"),
        full_name="Other",
        role="company_admin",
        email_verified=True,
    )
    session.add(other_admin)
    session.flush()
    other_co = Company(name="Other Co", admin_id=other_admin.id, subscription_tier="enterprise", subscription_status="active")
    session.add(other_co)
    session.flush()
    other_admin.company_id = other_co.id
    ensure_roles_for_company(session, other_co.id)
    session.commit()

    today = date.today().isoformat()
    h2 = _login(client, "other@test.com")
    assert client.get(f"/reports/shift-history?start_date={today}&end_date={today}", headers=h2).json() == []
    assert client.get(f"/reports/shift-history?start_date={today}&end_date={today}", headers=h).json()


def test_a_client_login_cannot_read_the_shift_history(session, client):
    """Even with every permission ticked — the audit trail is back-office only."""
    co, guard, site = _seed(session)
    role = get_role_by_slug(session, co.id, "client")
    matrix = default_matrix_admin()
    role.permissions_json = wrap_matrix(matrix)
    sync_role_permissions_from_matrix(session, role, matrix)
    cl = Client(company_id=co.id, name="Acme")
    session.add(cl)
    session.flush()
    session.add(
        User(
            email="portal@test.com",
            password_hash=get_password_hash("secret"),
            full_name="Portal",
            role="client",
            role_id=role.id,
            company_id=co.id,
            client_id=cl.id,
            is_active=True,
            email_verified=True,
        )
    )
    session.commit()

    today = date.today().isoformat()
    h = _login(client, "portal@test.com")
    r = client.get(f"/reports/shift-history?start_date={today}&end_date={today}", headers=h)
    assert r.status_code == 403


def test_a_role_without_the_report_permission_is_refused(session, client):
    co, guard, site = _seed(session)
    matrix = default_matrix_admin()
    matrix["reports"] = {"view": True, "shift_history_reports": False}
    role = Role(company_id=co.id, name="Scheduler", slug="scheduler", is_system=False, permissions_json=wrap_matrix(matrix))
    session.add(role)
    session.flush()
    sync_role_permissions_from_matrix(session, role, matrix)
    session.add(
        User(
            email="sup@test.com",
            password_hash=get_password_hash("secret"),
            full_name="Sup",
            role="supervisor",
            role_id=role.id,
            company_id=co.id,
            is_active=True,
            email_verified=True,
        )
    )
    session.commit()

    today = date.today().isoformat()
    h = _login(client, "sup@test.com")
    assert client.get(f"/reports/shift-history?start_date={today}&end_date={today}", headers=h).status_code == 403


def test_the_history_has_no_write_endpoints(session, client):
    """Normal users must not be able to edit or remove audit rows through the API."""
    co, guard, site = _seed(session)
    h = _login(client)
    _create_rota(client, h, guard.id, {str(guard.id): {"2026-08-10": [_block()]}})
    today = date.today().isoformat()
    row_id = client.get(f"/reports/shift-history?start_date={today}&end_date={today}", headers=h).json()[0]["id"]

    for method, path in (
        ("put", f"/reports/shift-history/{row_id}"),
        ("patch", f"/reports/shift-history/{row_id}"),
        ("delete", f"/reports/shift-history/{row_id}"),
        ("post", "/reports/shift-history"),
    ):
        call = getattr(client, method)
        r = call(path, headers=h) if method == "delete" else call(path, headers=h, json={})
        assert r.status_code in (404, 405), f"{method.upper()} {path} unexpectedly exists"

    assert session.query(ShiftAuditLog).filter(ShiftAuditLog.id == row_id).count() == 1
