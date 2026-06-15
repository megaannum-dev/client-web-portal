from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "mysql+pymysql://portal:portalsecret@localhost:3306/portal"
    firebase_project_id: str | None = None
    firebase_credentials_path: str | None = None
    firebase_service_account_json: str | None = None
    cors_origins: str = "http://localhost:3000,http://localhost:3001"
    firebase_auth_disabled: bool = False

    # Deployment environment marker (env var: APP_ENV). When "production",
    # all dev bypasses are forbidden and the app refuses to boot (fail-closed).
    app_env: str = "development"

    # Secure-by-default: dev bypasses are OFF unless explicitly enabled.
    # True (dev): register endpoint accepts `role` field for internal users.
    # False (prod/default): internal users cannot self-register; Super Admin
    # must pre-create them.
    dev_mode: bool = False

    @field_validator("app_env", mode="before")
    @classmethod
    def _normalize_app_env(cls, value: object) -> object:
        """Normalize APP_ENV (case- and whitespace-insensitive).

        Runs for every source (env vars, .env, direct init) because
        ``mode="before"`` fires prior to type coercion. Normalizing here means
        ALL downstream comparisons (e.g. ``assert_secure_config``) can compare
        against the canonical lowercase form, closing case/whitespace bypasses
        like ``"Production"`` or ``" production"``.
        """
        if isinstance(value, str):
            return value.strip().lower()
        return value


def assert_secure_config(settings: "Settings") -> None:
    """Fail-closed guard: a dev bypass must not survive a production marker.

    Raises RuntimeError when APP_ENV marks production yet any dev bypass
    (``dev_mode`` or ``firebase_auth_disabled``) is enabled. Pure and
    importable so it can be unit-tested without booting the app.
    """
    if settings.app_env == "production" and (
        settings.dev_mode or settings.firebase_auth_disabled
    ):
        enabled = [
            name
            for name, on in (
                ("dev_mode", settings.dev_mode),
                ("firebase_auth_disabled", settings.firebase_auth_disabled),
            )
            if on
        ]
        raise RuntimeError(
            "Refusing to start: APP_ENV='production' but insecure dev "
            f"bypass(es) are enabled: {', '.join(enabled)}. "
            "Disable them (set to False) or change APP_ENV."
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
