from app.services.rota_service import infer_shift_type_from_start, normalize_shift_type


def test_legacy_day_maps_from_start():
    assert normalize_shift_type("day", "08:00") == "morning"
    assert normalize_shift_type("day", "13:00") == "afternoon"
    assert normalize_shift_type("day", "17:15") == "evening"
    assert normalize_shift_type("day", "22:00") == "night"


def test_canonical_types_preserved():
    assert normalize_shift_type("morning") == "morning"
    assert normalize_shift_type("afternoon") == "afternoon"
    assert normalize_shift_type("evening") == "evening"
    assert normalize_shift_type("night") == "night"


def test_empty_infers_morning_default():
    assert normalize_shift_type(None) == "morning"
    assert infer_shift_type_from_start("09:30") == "morning"


def test_smtp_status_never_none():
    from app.services.platform_smtp_service import smtp_status

    status = smtp_status()
    assert isinstance(status["mail_server"], str)
    assert isinstance(status["mail_from"], str)
    assert isinstance(status["mail_from_name"], str)
    assert isinstance(status["mail_port"], int)
    assert "configured" in status
