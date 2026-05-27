from functools import lru_cache

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

    # True (dev): register endpoint accepts `role` field for internal users.
    # False (prod): internal users cannot self-register; Super Admin must pre-create them.
    dev_mode: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
