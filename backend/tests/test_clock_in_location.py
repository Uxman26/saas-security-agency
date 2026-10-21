from app.services.attendance_service import _site_location_label


class _Site:
    def __init__(self, name="", address="", postcode=""):
        self.name = name
        self.address = address
        self.postcode = postcode


def test_site_location_label_joins_parts():
    assert _site_location_label(None) == ""
    assert _site_location_label(_Site(name="The Hive London")) == "The Hive London"
    assert (
        _site_location_label(_Site(name="Dolphin Hotel", address="1 High St", postcode="SW1A 1AA"))
        == "Dolphin Hotel, 1 High St, SW1A 1AA"
    )
