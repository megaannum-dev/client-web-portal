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
    storage_root: str = "./crm_filesystem"  # base for the seven bucket defaults below (BE-5)
    storage_root_marketing: str | None = None  # default: {storage_root}/marketing
    storage_root_kyc: str | None = None  # default: {storage_root}/kyc
    storage_root_contact_log: str | None = None  # default: {storage_root}/contact_log
    storage_root_reports: str | None = None  # default: {storage_root}/reports
    storage_root_legal: str | None = "./crm_filesystem/legal_docs"  # default: {storage_root}/legal
    storage_root_statements: str | None = None  # default: {storage_root}/statements
    storage_root_chat: str | None = None  # default: {storage_root}/chat
    storage_root_ib_flex: str | None = None  # default: {storage_root}/ib_flex
    storage_root_ic_notes: str | None = None  # default: {storage_root}/ic_notes

    # Post-trade allocation — orders with no model name are attributed to this model
    pta_default_model_name: str = "Zero"

    # Newest trading day the allocation scan may reach, as YYYYMMDD. Left
    # unset it resolves to the newest day the IB flex archive holds records
    # for, so allocation never runs ahead of the source data it allocates.
    # Set it to pin the scan (e.g. to bootstrap an empty archive). Resolved
    # once per run() and never re-read, so it cannot drift mid-scan.
    pta_anchor_date: str | None = None

    # IBKR portfolio balance API — replaces the writer-less client_portfolios_* tables
    portfolio_api_url: str | None = "http://192.168.0.155:8000" 
    portfolio_api_timeout_seconds: float = 5.0

    # Bootstrap CLI — pre-seeded Super Admin (BE-20)
    bootstrap_admin_email: str | None = None
    bootstrap_admin_name: str = "Bootstrap Admin"

    # IB Flex — two interchangeable transports (mirrors storage_backend: "local"|"nas")
    ib_flex_transport: str = "stored"  # "stored" (read Bucket.IB_FLEX) | "live" (Flex Web Service)
    ib_flex_token: str | None = None
    ib_flex_query_id: str | None = None
    ib_flex_cache_ttl_seconds: int = 900


@lru_cache
def get_settings() -> Settings:
    return Settings()
