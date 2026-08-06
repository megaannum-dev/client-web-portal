from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "mysql+pymysql://portal:portalsecret@localhost:3306/portal"
    firebase_project_id: str | None = None
    firebase_credentials_path: str | None = None
    firebase_service_account_json: str | None = None
    # Public Web API key (NOT a secret -- same value the frontends embed). Required to ask
    # Firebase to SEND the set-password email via Identity Toolkit; see identity/mailer.py.
    firebase_web_api_key: str | None = None
    cors_origins: str = "http://localhost:3000,http://localhost:3001"
    firebase_auth_disabled: bool = False
    app_env: str = "development"

    # PC workspace — file storage (BE-1); renamed 014 C-5 (shared with onboarding KYC docs)
    storage_backend: str = "local"  # "local" | "nas"
    storage_root: str = "./crm_filesystem"  # base for the six bucket defaults below (BE-5)
    storage_root_marketing: str | None = None  # default: {storage_root}/marketing
    storage_root_kyc: str | None = None  # default: {storage_root}/kyc
    storage_root_contact_log: str | None = None  # default: {storage_root}/contact_log
    storage_root_reports: str | None = None  # default: {storage_root}/reports
    storage_root_legal: str | None = None  # default: {storage_root}/legal
    storage_root_statements: str | None = None  # default: {storage_root}/statements

    # Post-trade allocation — orders with no model name are attributed to this model
    pta_default_model_name: str = "Zero"

    # Trade reconciliation — abs-delta tolerance for notional comparisons (BE-7)
    recon_notional_epsilon: str = "0.01"

    # Bootstrap CLI — pre-seeded Super Admin (BE-20)
    bootstrap_admin_email: str | None = None
    bootstrap_admin_name: str = "Bootstrap Admin"

    # EoD PDF rendering — feature 015 (BE-9)
    pdf_renderer: str = "simple"  # "simple" (fpdf2, default) | "chromium" (Playwright)
    pdf_render_base_url: str = "http://localhost:3001"
    pdf_render_token: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
