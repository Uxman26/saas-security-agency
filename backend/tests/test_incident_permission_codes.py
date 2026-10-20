"""Incident grants on Incidents or My workspace must emit mobile-readable codes."""

from app.module_perms import legacy_codes_for_module_action
from app.rbac import PERM_INCIDENT_READ, PERM_INCIDENT_WRITE
from app.services.module_service import _expand_action_codes


def test_incidents_module_view_includes_legacy_read():
    codes = _expand_action_codes("incidents", "view")
    assert "incidents.view" in codes
    assert PERM_INCIDENT_READ in codes


def test_portal_incident_ticks_include_legacy_incident_codes():
    view = _expand_action_codes("my_portal", "incidents_view")
    assert "my_portal.incidents_view" in view
    assert PERM_INCIDENT_READ in view
    create = _expand_action_codes("my_portal", "incidents_create")
    assert "my_portal.incidents_create" in create
    assert PERM_INCIDENT_WRITE in create
    assert PERM_INCIDENT_READ in legacy_codes_for_module_action("my_portal", "incidents_view")
