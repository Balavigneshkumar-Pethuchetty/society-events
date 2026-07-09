from urllib.parse import quote_plus
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_host: str = "postgres"
    db_port: int = 5432
    db_name: str = "society_events"
    db_user: str
    db_password: str

    keycloak_url: str = "https://auth.gm-global-techies-town.club"
    keycloak_realm: str = "society-events"
    keycloak_public_url: str = "https://auth.gm-global-techies-town.club"
    internal_api_key: str
    society_id: str = "11100000-0000-0000-0000-000000000001"

    payment_provider: str = "MANUAL_UPI"

    # IMAP inbox for automated reconciliation (FR-05)
    imap_host: str = ""
    imap_port: int = 993
    imap_user: str = ""
    imap_password: str = ""
    imap_mailbox: str = "INBOX"
    reconciliation_interval_seconds: int = 300

    splunk_hec_url: str = ""
    splunk_hec_token: str = ""

    # Claude API (Anthropic) — alternative to Ollama for the IMAP email parser (FR-05).
    # Selected per-deployment via the ai_provider column in payment_reconciliation_settings
    # (admin-configurable, see PUT /settings); this key is an infra-level secret so it lives
    # in .env like splunk_hec_token above, not in the DB.
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"

    # External Payment Reconciliation service (~/payment_reconcilation_service) — used to
    # create centralized UPI payment intents on behalf of residents. Not to be confused with
    # this service's own IMAP-based reconciliation settings above.
    reconciliation_service_base_url: str = "http://host.containers.internal:8001"
    reconciliation_service_secret_key: str = ""
    reconciliation_service_audience: str = "payment-service"

    uploads_dir: str = "/app/uploads"

    # "testing" mounts the /test/* endpoints (clear-transactions, seed-transaction)
    # used to exercise the centralized reconciliation service's /parseEmail without a
    # real checkout. Any other value (default "production") leaves them unmounted.
    payment_service_env: str = "production"

    @property
    def is_testing(self) -> bool:
        return self.payment_service_env.lower() == "testing"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{quote_plus(self.db_user)}:{quote_plus(self.db_password)}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def jwks_uri(self) -> str:
        return (
            f"{self.keycloak_url}/realms/{self.keycloak_realm}"
            "/protocol/openid-connect/certs"
        )

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
