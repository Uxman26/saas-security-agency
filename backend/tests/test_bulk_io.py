import csv
import io
from datetime import date
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, UploadFile

from app.services import bulk_io_service as bio


def test_specs_cover_five_modules():
    assert set(bio.SPECS) == {"sites", "guards", "clients", "contractors", "sub_contractors"}
    for key, spec in bio.SPECS.items():
        assert spec.columns, key
        assert any(c.required for c in spec.columns), key
        assert {c.key for c in spec.columns} != {c.key for c in bio.SITE_SPEC.columns} or key == "sites"


def test_module_columns_are_distinct():
    site_keys = {c.key for c in bio.SITE_SPEC.columns}
    guard_keys = {c.key for c in bio.GUARD_SPEC.columns}
    client_keys = {c.key for c in bio.CLIENT_SPEC.columns}
    assert "assignment_instructions" in site_keys
    assert "sia_number" in guard_keys
    assert "double_rate_special_days" in client_keys
    assert "main_contractor_name" in {c.key for c in bio.SUB_CONTRACTOR_SPEC.columns}
    assert "type" in {c.key for c in bio.CONTRACTOR_SPEC.columns}
    assert site_keys != guard_keys != client_keys


def test_get_spec_aliases_staff():
    assert bio.get_spec("staff").module == "guards"
    with pytest.raises(HTTPException):
        bio.get_spec("unknown")


def test_template_bytes_xlsx_and_csv():
    for module in bio.MODULES:
        xbody, xmedia, xname = bio.template_bytes(module, "xlsx")
        assert xbody and "sheet" in xmedia
        assert xname.endswith(".xlsx")
        cbody, cmedia, cname = bio.template_bytes(module, "csv")
        assert cbody and cmedia == "text/csv"
        assert cname.endswith(".csv")
        text = cbody.decode("utf-8-sig")
        headers = next(csv.reader(io.StringIO(text)))
        expected = [c.header for c in bio.SPECS[module].columns]
        assert headers == expected


def test_normalise_rows_maps_headers():
    spec = bio.CLIENT_SPEC
    rows = bio._normalise_rows(
        spec,
        [{"Name": "Acme", "Email": "a@b.com", "Phone": "+441234567890"}],
    )
    assert rows == [
        {
            **{c.key: "" for c in spec.columns},
            "name": "Acme",
            "email": "a@b.com",
            "phone": "+441234567890",
        }
    ]


def test_parse_helpers():
    assert bio._parse_date("2024-01-02") == date(2024, 1, 2)
    assert bio._parse_date("02/01/2024") == date(2024, 1, 2)
    assert bio._parse_bool("yes") is True
    assert bio._parse_bool("0") is False
    with pytest.raises(ValueError):
        bio._parse_date("not-a-date")


def test_validate_client_row_missing_name():
    errors = []
    bio._validate_client_row({"name": ""}, errors)
    assert errors


def test_validate_contractor_type():
    errors = []
    bio._validate_contractor_row({"name": "X", "type": "partner"}, errors)
    assert any("type" in e for e in errors)


def test_read_upload_csv():
    raw = b"name,email\nAcme,a@b.com\n"
    upload = UploadFile(filename="clients.csv", file=io.BytesIO(raw))
    rows = bio._read_upload(upload)
    assert rows[0]["name"] == "Acme"


def test_preview_marks_invalid_and_duplicate(monkeypatch):
    company = MagicMock(id=1)
    user = MagicMock(id=9)
    db = MagicMock()

    monkeypatch.setattr(bio, "_company", lambda *_a, **_k: company)
    monkeypatch.setattr(bio, "_read_upload", lambda *_a, **_k: [
        {"name": "", "email": "bad@x.com"},
        {"name": "Existing", "email": "e@x.com"},
        {"name": "New Co", "email": "n@x.com"},
    ])
    monkeypatch.setattr(bio, "_find_client_dup", lambda *_a, **_k: MagicMock(id=42) if _a[2] == "Existing" else None)

    preview = bio.preview_import(db, user, "clients", MagicMock(), update_existing=False)
    assert preview["total"] == 3
    assert preview["invalid"] >= 1
    assert preview["duplicate"] >= 1
    statuses = {r["status"] for r in preview["rows"]}
    assert "invalid" in statuses
    assert "duplicate" in statuses
    assert "valid" in statuses


def test_commit_skips_duplicates_without_update(monkeypatch):
    company = MagicMock(id=1)
    user = MagicMock(id=9)
    db = MagicMock()
    created = []

    monkeypatch.setattr(bio, "_company", lambda *_a, **_k: company)
    monkeypatch.setattr(bio, "_read_upload", lambda *_a, **_k: [
        {"name": "Dup", "email": ""},
        {"name": "Fresh", "email": ""},
    ])
    monkeypatch.setattr(bio, "_find_client_dup", lambda *_a, **_k: MagicMock(id=7) if _a[2] == "Dup" else None)
    monkeypatch.setattr(bio.client_service, "create_client", lambda *_a, **_k: created.append(_a[1].name) or MagicMock(id=99))
    monkeypatch.setattr(bio.audit_service, "log_action", lambda *_a, **_k: None)

    summary = bio.commit_import(db, user, "clients", MagicMock(), update_existing=False)
    assert summary["skipped"] == 1
    assert summary["created"] == 1
    assert created == ["Fresh"]
