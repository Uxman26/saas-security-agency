from app.services.patrol_qr_utils import MAX_GPS_ACCURACY_M, normalize_qr_token


def test_normalize_bare_token():
    assert normalize_qr_token("  abc-123  ") == "abc-123"


def test_normalize_sticker_url():
    assert (
        normalize_qr_token("https://controlops.co.uk/patrol/check/tok-9")
        == "tok-9"
    )


def test_normalize_url_with_query():
    assert (
        normalize_qr_token("https://x.test/patrol/check/t1?utm=1#frag") == "t1"
    )


def test_max_gps_accuracy_is_7m():
    assert MAX_GPS_ACCURACY_M == 7.0
