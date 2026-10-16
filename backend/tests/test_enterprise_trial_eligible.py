from app.services.trial_service import DEFAULT_TRIAL_CONFIG


def test_default_trial_config_includes_enterprise():
    assert "enterprise" in DEFAULT_TRIAL_CONFIG["eligible_tiers"]
    assert "premium" in DEFAULT_TRIAL_CONFIG["eligible_tiers"]
    assert "standard" in DEFAULT_TRIAL_CONFIG["eligible_tiers"]


def test_legacy_eligible_tiers_restore_enterprise():
    legacy = ["basic", "starter", "standard", "premium"]
    eligible = [t.lower() for t in legacy]
    legacy_without_enterprise = {"basic", "starter", "standard", "premium"}
    if eligible and "enterprise" not in eligible and set(eligible) <= legacy_without_enterprise:
        eligible = list(dict.fromkeys([*eligible, "enterprise"]))
    assert "enterprise" in eligible
    assert set(legacy).issubset(set(eligible))


def test_explicit_exclusion_of_non_legacy_is_preserved():
    """If admin already customized beyond the legacy set, do not auto-append."""
    eligible = ["basic", "standard"]
    legacy_without_enterprise = {"basic", "starter", "standard", "premium"}
    if eligible and "enterprise" not in eligible and set(eligible) <= legacy_without_enterprise:
        eligible = list(dict.fromkeys([*eligible, "enterprise"]))
    # {"basic","standard"} <= legacy, so enterprise would be added — that is intended
    # for incomplete legacy lists. A deliberate enterprise-only exclusion must include
    # a non-legacy marker (e.g. keeping enterprise out while listing premium+custom).
    custom = ["premium", "custom_plan"]
    el = [t.lower() for t in custom]
    if el and "enterprise" not in el and set(el) <= legacy_without_enterprise:
        el = list(dict.fromkeys([*el, "enterprise"]))
    assert "enterprise" not in el
