"""Regression tests for the HIGH findings: brute force, logout, session timeout."""

from datetime import datetime, timedelta, timezone

from app.config import settings
from app.models import LoginLog, UserSession
from tests.test_security_auth import PASSWORD, auth, login, seed_company


# --- HIGH #5: brute force / rate limiting -------------------------------------------


def test_repeated_failures_lock_the_account(session, client):
    """Before the fix an attacker had unlimited guesses against one mailbox."""
    seed_company(session, "brute@test.com")

    for attempt in range(settings.login_max_attempts_per_account):
        r = client.post("/auth/login", json={"email": "brute@test.com", "password": "Wr0ng!guess"})
        assert r.status_code == 401, f"attempt {attempt} unexpectedly {r.status_code}"

    blocked = client.post("/auth/login", json={"email": "brute@test.com", "password": "Wr0ng!guess"})
    assert blocked.status_code == 429, "no lockout after the configured attempt limit"
    assert "Retry-After" in blocked.headers

    # The correct password must also be refused while locked, or the lockout is theatre.
    correct = client.post("/auth/login", json={"email": "brute@test.com", "password": PASSWORD})
    assert correct.status_code == 429


def test_lockout_is_scoped_to_the_attacked_account(session, client):
    """One account being ground must not lock out an unrelated colleague.

    The per-IP counter is far above the per-account one precisely so that a shared
    office NAT does not turn one careless user into an outage for everyone.
    """
    seed_company(session, "victim@test.com")
    seed_company(session, "bystander@test.com")

    for _ in range(settings.login_max_attempts_per_account):
        client.post("/auth/login", json={"email": "victim@test.com", "password": "Wr0ng!guess"})

    assert client.post("/auth/login", json={"email": "victim@test.com", "password": PASSWORD}).status_code == 429
    assert login(client, "bystander@test.com"), "bystander was locked out"


def test_lockout_expires_after_the_window(session, client):
    """An honest user who forgot their password gets back in, they are not bricked."""
    seed_company(session, "patient@test.com")

    for _ in range(settings.login_max_attempts_per_account):
        client.post("/auth/login", json={"email": "patient@test.com", "password": "Wr0ng!guess"})
    assert client.post("/auth/login", json={"email": "patient@test.com", "password": PASSWORD}).status_code == 429

    stale = datetime.now(timezone.utc) - timedelta(minutes=settings.login_attempt_window_minutes + 5)
    for row in session.query(LoginLog).filter(LoginLog.email == "patient@test.com").all():
        row.login_at = stale
    session.commit()

    assert login(client, "patient@test.com"), "lockout never lifted"


def test_failed_attempts_are_logged_for_monitoring(session, client):
    seed_company(session, "logged@test.com")
    client.post("/auth/login", json={"email": "logged@test.com", "password": "Wr0ng!guess"})

    rows = session.query(LoginLog).filter(
        LoginLog.email == "logged@test.com", LoginLog.status == "failed"
    ).all()
    assert rows, "failed attempt was not recorded"


# --- HIGH #6: logout must invalidate server-side, not just in one tab ---------------


def test_logout_invalidates_the_token_everywhere(session, client):
    """The core cross-tab bug: another tab holding the same token stayed authenticated.

    The token here stands in for that second tab — it is never cleared, yet it must stop
    working the moment the first tab logs out.
    """
    seed_company(session, "logout@test.com")
    token = login(client, "logout@test.com")
    assert client.get("/auth/me", headers=auth(token)).status_code == 200

    assert client.post("/auth/logout", headers=auth(token)).status_code == 200

    after = client.get("/auth/me", headers=auth(token))
    assert after.status_code == 401, "token still worked after logout"


def test_logout_is_idempotent(session, client):
    seed_company(session, "logout2@test.com")
    token = login(client, "logout2@test.com")
    assert client.post("/auth/logout", headers=auth(token)).status_code == 200
    # Second call is unauthenticated now, which is the correct outcome, not a 500.
    assert client.post("/auth/logout", headers=auth(token)).status_code == 401


def test_logout_does_not_touch_other_sessions(session, client):
    """Signing out of one device must leave the others alone."""
    seed_company(session, "twodev@test.com")
    phone = login(client, "twodev@test.com")
    laptop = login(client, "twodev@test.com")

    assert client.post("/auth/logout", headers=auth(phone)).status_code == 200
    assert client.get("/auth/me", headers=auth(phone)).status_code == 401
    assert client.get("/auth/me", headers=auth(laptop)).status_code == 200


def test_logout_all_revokes_every_session(session, client):
    seed_company(session, "allout@test.com")
    first = login(client, "allout@test.com")
    second = login(client, "allout@test.com")

    assert client.post("/auth/logout-all", headers=auth(first)).status_code == 200
    assert client.get("/auth/me", headers=auth(first)).status_code == 401
    assert client.get("/auth/me", headers=auth(second)).status_code == 401


def test_password_reset_kills_existing_sessions(session, client):
    """A recovery that leaves the attacker's session alive has not recovered anything."""
    from app.auth import create_password_reset_token

    user, _ = seed_company(session, "reset2@test.com")
    token = login(client, "reset2@test.com")
    assert client.get("/auth/me", headers=auth(token)).status_code == 200

    reset = client.post(
        "/auth/reset-password",
        json={"token": create_password_reset_token(user.id), "new_password": "N3w!password"},
    )
    assert reset.status_code == 200, reset.text

    assert client.get("/auth/me", headers=auth(token)).status_code == 401


def test_a_token_without_a_session_cannot_authenticate(session, client):
    """A forged token signed with the right key is still useless without a session row."""
    from app.auth import create_access_token

    user, _ = seed_company(session, "nosession@test.com")
    forged = create_access_token({"sub": user.id}, expires_delta=timedelta(hours=1))
    assert client.get("/auth/me", headers=auth(forged)).status_code == 401

    forged_with_fake_jti = create_access_token(
        {"sub": user.id, "jti": "deadbeef" * 4}, expires_delta=timedelta(hours=1)
    )
    assert client.get("/auth/me", headers=auth(forged_with_fake_jti)).status_code == 401


def test_session_cannot_be_reused_by_another_user(session, client):
    """A token whose sub and jti disagree must be refused."""
    from app.auth import create_access_token

    seed_company(session, "owner@test.com")
    intruder, _ = seed_company(session, "intruder@test.com")

    owner_token = login(client, "owner@test.com")
    owner_session = session.query(UserSession).order_by(UserSession.id.desc()).first()

    spliced = create_access_token(
        {"sub": intruder.id, "jti": owner_session.jti}, expires_delta=timedelta(hours=1)
    )
    assert client.get("/auth/me", headers=auth(spliced)).status_code == 401


# --- HIGH #7: idle session timeout --------------------------------------------------


def test_idle_session_expires_server_side(session, client):
    """Sessions used to live until the token's own expiry — 8 hours, or 30 days.

    Idle time is aged by rewriting last_seen_at rather than by sleeping, so the test
    stays fast and does not depend on wall-clock timing.
    """
    seed_company(session, "idle@test.com")
    token = login(client, "idle@test.com")
    assert client.get("/auth/me", headers=auth(token)).status_code == 200

    row = session.query(UserSession).order_by(UserSession.id.desc()).first()
    row.last_seen_at = datetime.now(timezone.utc) - timedelta(
        minutes=settings.session_idle_timeout_minutes + 1
    )
    session.commit()

    assert client.get("/auth/me", headers=auth(token)).status_code == 401, "idle session survived"


def test_activity_keeps_a_session_alive(session, client):
    """Use inside the window must extend it, or the timeout is an absolute one."""
    seed_company(session, "active@test.com")
    token = login(client, "active@test.com")

    row = session.query(UserSession).order_by(UserSession.id.desc()).first()
    just_inside = datetime.now(timezone.utc) - timedelta(
        minutes=settings.session_idle_timeout_minutes - 1
    )
    row.last_seen_at = just_inside
    session.commit()

    assert client.get("/auth/me", headers=auth(token)).status_code == 200

    session.expire_all()
    refreshed = session.query(UserSession).filter(UserSession.id == row.id).first()
    bumped = refreshed.last_seen_at
    if bumped.tzinfo is None:
        bumped = bumped.replace(tzinfo=timezone.utc)
    assert bumped > just_inside, "last_seen_at was not advanced by activity"


def test_absolute_expiry_still_applies(session, client):
    """Activity cannot extend a session past its hard ceiling."""
    seed_company(session, "absolute@test.com")
    token = login(client, "absolute@test.com")

    row = session.query(UserSession).order_by(UserSession.id.desc()).first()
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    row.last_seen_at = datetime.now(timezone.utc)
    session.commit()

    assert client.get("/auth/me", headers=auth(token)).status_code == 401


def test_remember_me_gets_a_longer_idle_window(session, client):
    """Opting in on a trusted device should survive a lunch break; the default should not."""
    seed_company(session, "remember@test.com")

    plain = client.post("/auth/login", json={"email": "remember@test.com", "password": PASSWORD})
    assert plain.status_code == 200
    plain_row = session.query(UserSession).order_by(UserSession.id.desc()).first()
    assert plain_row.idle_timeout_minutes == settings.session_idle_timeout_minutes

    remembered = client.post(
        "/auth/login",
        json={"email": "remember@test.com", "password": PASSWORD, "remember_me": True},
    )
    assert remembered.status_code == 200
    token = remembered.json()["access_token"]
    row = session.query(UserSession).order_by(UserSession.id.desc()).first()
    assert row.idle_timeout_minutes == settings.session_remember_idle_days * 24 * 60

    # Idle well past the default window, but inside the remembered one.
    row.last_seen_at = datetime.now(timezone.utc) - timedelta(
        minutes=settings.session_idle_timeout_minutes + 30
    )
    session.commit()
    assert client.get("/auth/me", headers=auth(token)).status_code == 200

    # Past the remembered window it dies like any other session.
    session.expire_all()
    row = session.query(UserSession).filter(UserSession.jti == row.jti).first()
    row.last_seen_at = datetime.now(timezone.utc) - timedelta(
        days=settings.session_remember_idle_days + 1
    )
    session.commit()
    assert client.get("/auth/me", headers=auth(token)).status_code == 401


def test_remember_me_session_is_still_revoked_by_logout(session, client):
    """A longer idle window must not make a session harder to kill."""
    seed_company(session, "remember2@test.com")
    r = client.post(
        "/auth/login",
        json={"email": "remember2@test.com", "password": PASSWORD, "remember_me": True},
    )
    token = r.json()["access_token"]
    assert client.post("/auth/logout", headers=auth(token)).status_code == 200
    assert client.get("/auth/me", headers=auth(token)).status_code == 401


def test_login_records_a_session_with_provenance(session, client):
    """Sessions carry IP and user agent so an admin can spot an unexpected one."""
    seed_company(session, "prov@test.com")
    login(client, "prov@test.com")

    row = session.query(UserSession).order_by(UserSession.id.desc()).first()
    assert row is not None
    assert row.revoked_at is None
    assert row.expires_at is not None
    assert row.user_agent is not None
