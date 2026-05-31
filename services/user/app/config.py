from urllib.parse import quote_plus
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Accept credentials separately so special chars in passwords are safe
    db_host: str = "postgres"
    db_port: int = 5432
    db_name: str = "society_events"
    db_user: str
    db_password: str

    keycloak_url: str = "http://keycloak:8080"
    keycloak_realm: str = "society-events"
    # Externally reachable Keycloak URL (browser-side). Used for Swagger UI OAuth2 URLs.
    # Defaults to port 8080 to match the default NGINX_PORT; override in .env if needed.
    keycloak_public_url: str = "http://localhost:8080"
    # Keycloak master-realm admin credentials for role assignment via Admin REST API
    keycloak_admin_user: str = "admin"
    keycloak_admin_password: str
    internal_api_key: str
    # Default society UUID matches seed data; override for multi-society later
    society_id: str = "11100000-0000-0000-0000-000000000001"
    society_name: str = "GM Global Techies Town"
    society_short_name: str = "GMGT"
    society_city: str = "Bengaluru"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{quote_plus(self.db_user)}:{quote_plus(self.db_password)}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def jwks_uri(self) -> str:
        return f"{self.keycloak_url}/realms/{self.keycloak_realm}/protocol/openid-connect/certs"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
