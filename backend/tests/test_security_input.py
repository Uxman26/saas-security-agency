"""Tier 3 (MEDIUM) regressions: input hygiene and HTML escaping.

Covers finding #8 (whitespace-only and unsafe characters accepted in restricted
fields, and stored input rendered back unescaped) and #9 (no length limits), for the
fields beyond login that Tier 1 already covered.

Each test fails against the code as it was before the corresponding fix.
"""

import pytest
from pydantic import ValidationError

from app.html_safe import esc, esc_map
from app.models import Company, Lead, User
from app.schemas import (
    AllowanceCreate,
    ClientCreate,
    ExpenseCreate,
    GuardDocumentCreate,
    LeadCustomStatusCreate,
    LeadNoteCreate,
    LeadQuotationCreate,
    RotaPlanCreate,
    ShiftOvertimeRequest,
    SiteCreate,
    SpecialDayCreate,
)
from app.validators import COMPANY_NAME_MAX, NOTE_MAX, SITE_NAME_MAX, TEXT_MAX

# --- #8: HTML escaping of stored input rendered back out ------------------------------
#
# The frontend is React with no dangerouslySetInnerHTML anywhere, so the browser is not
# the sink. The sink is outbound email: bodies are assembled as HTML strings from
# user-typed values, so an unescaped value becomes live markup inside a genuine,
# correctly-signed message from the platform.

XSS_PAYLOADS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<a href="http://evil.example">Reset your password</a>',
    "\"><b>bold</b>",
    "<iframe src='http://evil.example'></iframe>",
]


@pytest.mark.parametrize("payload", XSS_PAYLOADS)
def test_esc_neutralises_markup(payload):
    out = esc(payload)
    assert "<" not in out
    assert ">" not in out
    assert "&lt;" in out


def test_esc_escapes_quotes_so_it_is_safe_inside_an_attribute():
    # quote=True matters: these values land in href="..." and style='...' contexts.
    out = esc('" onmouseover="alert(1)')
    assert '"' not in out
    assert "&quot;" in out


def test_esc_renders_none_as_empty_not_the_string_none():
    assert esc(None) == ""


def test_esc_map_escapes_every_value():
    out = esc_map({"title": "<b>x</b>", "note": None, "n": 5})
    assert out == {"title": "&lt;b&gt;x&lt;/b&gt;", "note": "", "n": "5"}


def _capture_lead_email(session, monkeypatch, title: str) -> str:
    """Drive the real notify_lead_email path and return the HTML body it would send."""
    from app.services import lead_email_service

    user = User(
        email="recipient@example.com",
        password_hash="x",
        full_name="Recipient",
        role="company_admin",
        email_verified=True,
        is_active=True,
    )
    session.add(user)
    session.flush()
    company = Company(name="Co", admin_id=user.id, subscription_tier="enterprise", subscription_status="active")
    session.add(company)
    session.flush()
    user.company_id = company.id
    session.commit()

    sent: dict[str, str] = {}
    monkeypatch.setattr(lead_email_service.email_service, "is_company_configured", lambda co: True)
    monkeypatch.setattr(
        lead_email_service.email_service,
        "send_and_log",
        lambda db, company_id, to, subject, body, key: sent.update({"body": body, "subject": subject}),
    )

    lead = Lead(company_id=company.id, title=title, source="web", status="new")
    session.add(lead)
    session.commit()

    lead_email_service.email_for_lead_event(
        session, user.id, lead, "lead_new", recipient_id=user.id
    )
    assert "body" in sent, "the email path did not run, so nothing was asserted"
    return sent["body"]


@pytest.mark.parametrize("payload", XSS_PAYLOADS)
def test_lead_email_body_escapes_the_lead_title(session, monkeypatch, payload):
    """A lead title is user-controlled and lands in an HTML email template.

    Goes through email_for_lead_event rather than re-implementing the render, so the
    test is tied to the code that actually builds the message.
    """
    body = _capture_lead_email(session, monkeypatch, payload)
    # The template's own markup survives; the payload's does not.
    assert "<strong>" in body
    assert payload not in body
    assert "<script" not in body.lower()
    assert "<a href" not in body.lower()
    assert "<iframe" not in body.lower()


def test_verification_email_escapes_the_recipient_name(session, monkeypatch):
    """user.full_name reaches the verify-email body, which is sent as HTML."""
    from app.services import auth_service

    sent: dict[str, str] = {}
    monkeypatch.setattr(auth_service.email_service, "is_configured", lambda: True)
    monkeypatch.setattr(
        auth_service.email_service,
        "send_email_async",
        lambda to, subject, body: sent.update({"body": body}),
    )

    user = User(
        email="victim@example.com",
        password_hash="x",
        full_name='<a href="http://evil.example">Click</a>',
        role="company_admin",
        is_active=True,
        email_verified=False,
    )
    session.add(user)
    session.commit()

    auth_service.send_verification_email(user)
    body = sent.get("body")
    assert body, "the verification email was not sent, so nothing was asserted"
    # Exactly one live anchor: the template's own verify link. The one smuggled in via
    # the display name is inert text.
    assert body.lower().count("<a href") == 1
    assert "&lt;a href=" in body


# --- #8: whitespace-only submissions --------------------------------------------------

WHITESPACE = ["   ", "\t", "\n", " \t\n ", ""]


@pytest.mark.parametrize("blank", WHITESPACE)
def test_client_name_rejects_whitespace_only(blank):
    with pytest.raises(ValidationError):
        ClientCreate(name=blank, site_type=1)


@pytest.mark.parametrize("blank", WHITESPACE)
def test_site_name_rejects_whitespace_only(blank):
    with pytest.raises(ValidationError):
        SiteCreate(name=blank, site_type=1)


@pytest.mark.parametrize("blank", WHITESPACE)
def test_lead_note_body_rejects_whitespace_only(blank):
    with pytest.raises(ValidationError):
        LeadNoteCreate(body=blank)


@pytest.mark.parametrize("blank", WHITESPACE)
def test_shift_overtime_reason_rejects_whitespace_only(blank):
    """An audit trail whose reason is three spaces is not an audit trail."""
    with pytest.raises(ValidationError):
        ShiftOvertimeRequest(new_end="18:00", reason=blank)


@pytest.mark.parametrize(
    "model,kwargs,field",
    [
        (AllowanceCreate, {"amount": 5.0}, "name"),
        (LeadCustomStatusCreate, {}, "name"),
        (LeadQuotationCreate, {}, "title"),
        (GuardDocumentCreate, {}, "document_type"),
        (SpecialDayCreate, {"date": "2026-01-01"}, "label"),
        (RotaPlanCreate, {"start_date": "2026-01-01", "day_count": 7}, "name"),
        (ExpenseCreate, {"expense_date": "2026-01-01", "amount_ex_vat": 1.0}, "category"),
    ],
)
def test_required_text_fields_reject_whitespace_only(model, kwargs, field):
    with pytest.raises(ValidationError):
        model(**{**kwargs, field: "   "})


def test_surrounding_whitespace_is_stripped_not_rejected():
    """A user who pastes a value with a trailing space should not see an error."""
    assert ClientCreate(name="  Acme Ltd  ").name == "Acme Ltd"
    assert LeadNoteCreate(body="  spoke to them  ").body == "spoke to them"


# --- #9: length limits ----------------------------------------------------------------


@pytest.mark.parametrize(
    "model,kwargs,field,limit",
    [
        # Each limit mirrors the matching frontend rule, so the UI never accepts a value
        # the API then rejects. See validators.py / frontend/lib/text-limits.ts.
        (ClientCreate, {}, "name", COMPANY_NAME_MAX),
        (SiteCreate, {"site_type": 1}, "name", SITE_NAME_MAX),
        (AllowanceCreate, {"amount": 5.0}, "name", TEXT_MAX),
        (LeadNoteCreate, {}, "body", NOTE_MAX),
        (LeadCustomStatusCreate, {}, "name", TEXT_MAX),
        (GuardDocumentCreate, {}, "document_type", TEXT_MAX),
        (RotaPlanCreate, {"start_date": "2026-01-01", "day_count": 7}, "name", TEXT_MAX),
    ],
)
def test_text_fields_enforce_a_maximum_length(model, kwargs, field, limit):
    at_limit = model(**{**kwargs, field: "a" * limit})
    assert len(getattr(at_limit, field)) == limit
    with pytest.raises(ValidationError):
        model(**{**kwargs, field: "a" * (limit + 1)})


def test_oversized_payload_is_rejected_not_truncated():
    """Silent truncation would store a different value than the user was shown."""
    with pytest.raises(ValidationError):
        ClientCreate(name="a" * 5000)


def test_backend_and_frontend_limit_tables_agree():
    """A server cap below the UI's cap is a form that fails on submit.

    validators.py and frontend/lib/text-limits.ts are maintained as mirrors; this
    catches an edit to one of them that forgets the other.
    """
    import re
    from pathlib import Path

    ts = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "text-limits.ts"
    if not ts.exists():
        pytest.skip("frontend not present in this checkout")

    ui = {k: int(v) for k, v in re.findall(r"^\s*(\w+):\s*(\d+),", ts.read_text(), re.M)}
    pairs = {
        "siteName": SITE_NAME_MAX,
        "companyName": COMPANY_NAME_MAX,
        "text": TEXT_MAX,
        "note": NOTE_MAX,
    }
    for key, server_max in pairs.items():
        assert key in ui, f"{key} missing from text-limits.ts"
        assert ui[key] == server_max, (
            f"{key}: UI allows {ui[key]} but the API caps at {server_max}"
        )


# --- #8: unsafe characters are stored safely rather than banned outright --------------


def test_names_containing_markup_are_accepted_but_escaped_on_render():
    """We do not reject apostrophes and angle brackets outright.

    "O'Brien & Sons" is a real company name, and a blanket character ban breaks
    legitimate input while doing nothing that escaping at the render point does not
    already do. The contract is: store what the user typed, escape where it is used.
    """
    name = "O'Brien & Sons <Security>"
    parsed = ClientCreate(name=name)
    assert parsed.name == name
    rendered = esc(parsed.name)
    assert "<Security>" not in rendered
    assert "&amp;" in rendered and "&#x27;" in rendered
