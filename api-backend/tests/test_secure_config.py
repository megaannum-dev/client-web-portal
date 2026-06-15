"""Self-contained tests for B8.1 secure-default + fail-closed prod assertion.

Deliberately does NOT depend on any shared conftest/fixtures (B0 harness is
built in a parallel worktree). Imports the pure assertion function directly.
"""

import pytest

from app.core.config import Settings, assert_secure_config


def _settings(**overrides) -> Settings:
    # _env_file=None prevents reading a real .env so defaults are deterministic.
    return Settings(_env_file=None, **overrides)


def test_prod_with_dev_mode_raises() -> None:
    with pytest.raises(RuntimeError):
        assert_secure_config(_settings(app_env="production", dev_mode=True))


def test_prod_with_firebase_auth_disabled_raises() -> None:
    with pytest.raises(RuntimeError):
        assert_secure_config(
            _settings(app_env="production", firebase_auth_disabled=True)
        )


def test_prod_with_both_bypasses_off_ok() -> None:
    # Should not raise.
    assert_secure_config(
        _settings(app_env="production", dev_mode=False, firebase_auth_disabled=False)
    )


def test_development_allows_bypasses() -> None:
    # Dev is permitted to enable bypasses; must not raise.
    assert_secure_config(
        _settings(app_env="development", dev_mode=True, firebase_auth_disabled=True)
    )


def test_secure_defaults() -> None:
    s = _settings()
    assert s.dev_mode is False, "dev_mode must default to False (secure-by-default)"
    assert s.app_env == "development", "app_env must default to 'development'"


def test_default_settings_pass_assertion() -> None:
    # The shipped defaults must be a bootable, secure config.
    assert_secure_config(_settings())


# --- Normalization: prove case/whitespace bypasses are closed (FINDING 1+2) ---


@pytest.mark.parametrize(
    "app_env",
    [
        "Production",  # mixed case (FINDING 1)
        "PRODUCTION",  # all caps (FINDING 1)
        " production",  # leading space (FINDING 2)
        "production ",  # trailing space (FINDING 2)
        " Production ",  # both, mixed case
    ],
)
def test_noncanonical_production_with_dev_mode_raises(app_env: str) -> None:
    with pytest.raises(RuntimeError):
        assert_secure_config(_settings(app_env=app_env, dev_mode=True))


@pytest.mark.parametrize(
    "app_env",
    [
        "Production",
        "PRODUCTION",
        " production",
        "production ",
    ],
)
def test_noncanonical_production_with_firebase_disabled_raises(app_env: str) -> None:
    with pytest.raises(RuntimeError):
        assert_secure_config(
            _settings(app_env=app_env, firebase_auth_disabled=True)
        )


def test_app_env_is_normalized_on_the_model() -> None:
    # The validator normalizes to the canonical lowercase, stripped form.
    assert _settings(app_env="  PRODUCTION  ").app_env == "production"
    assert _settings(app_env="Development").app_env == "development"


def test_mixed_case_development_allows_bypasses() -> None:
    # Non-production (any case) must still permit dev bypasses; must not raise.
    assert_secure_config(
        _settings(app_env="Development", dev_mode=True, firebase_auth_disabled=True)
    )
