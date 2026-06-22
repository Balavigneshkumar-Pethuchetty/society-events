from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Redis
    redis_url: str = "redis://redis:6379"
    redis_password: str = ""

    # Keycloak (centralized auth service)
    keycloak_url: str = "https://auth.gm-global-techies-town.club"
    keycloak_realm: str = "society-events"
    keycloak_admin_user: str = "admin"
    keycloak_admin_password: str

    # otp-bridge Keycloak service account
    otp_bridge_client_id: str = "otp-bridge"
    otp_bridge_client_secret: str

    # User service (internal, never through nginx)
    user_service_url: str = "http://user-service:3001"
    internal_api_key: str

    # Society name used in SMS body
    society_name: str = "Society Events"

    # OTP settings
    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 3
    otp_rate_limit_seconds: int = 60

    # Bridge session (8 hours)
    session_ttl_seconds: int = 28_800

    # ── SMS Gateway ────────────────────────────────────────────────────────────
    # "fast2sms" → Fast2SMS cloud API — recommended, no hardware needed
    # "gammu"    → USB modem via Gammu CLI (physical phone connected by cable)
    # "httpsms"  → Android app over Wi-Fi/data (no USB cable required)
    # "log"      → print OTP to stdout (dev / demo / testing)
    # "disabled" → silently no-op
    sms_gateway: str = "log"

    # Fast2SMS settings (sms_gateway=fast2sms)
    fast2sms_api_key: str = ""   # from fast2sms.com → Dev API → View

    # Gammu settings (sms_gateway=gammu)
    gammu_config: str = "/etc/gammurc"

    # HTTP SMS settings (sms_gateway=httpsms)
    # Install "Android SMS Gateway" app on your phone — see docs/mobile-otp-setup.md
    # The app exposes a local REST endpoint; set the URL it gives you + the API key.
    http_sms_url: str = ""          # e.g. http://192.168.1.100:8080
    http_sms_api_key: str = ""      # from the app's settings screen
    # Which phone number to send FROM (must match the SIM in the gateway phone)
    http_sms_from: str = ""         # e.g. +919876543210

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
