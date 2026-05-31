#!/usr/bin/env bash
# Usage: ./scripts/sync-keycloak-name.sh
# Reads SOCIETY_NAME from .env and updates the live Keycloak realm display name
# and email fromDisplayName to match. Run this after changing SOCIETY_NAME in .env.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

SOCIETY_NAME="${SOCIETY_NAME:-GM Global Techies Town}"
KC_ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
KC_ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-}"
KC_URL="http://localhost:${KEYCLOAK_PORT:-8081}"
REALM="society-events"
GMAIL_USER="${GMAIL_SMTP_USER:-}"
GMAIL_PASS="${GMAIL_APP_PASSWORD:-}"

echo "Syncing Keycloak realm display name → \"$SOCIETY_NAME\""

TOKEN=$(curl -sf -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli&grant_type=password&username=$KC_ADMIN_USER&password=$KC_ADMIN_PASS" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -sf -X PUT "$KC_URL/admin/realms/$REALM" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"displayName\": \"$SOCIETY_NAME\",
    \"displayNameHtml\": \"$SOCIETY_NAME\",
    \"smtpServer\": {
      \"host\": \"smtp.gmail.com\",
      \"port\": \"587\",
      \"from\": \"$GMAIL_USER\",
      \"fromDisplayName\": \"$SOCIETY_NAME\",
      \"ssl\": \"false\",
      \"starttls\": \"true\",
      \"auth\": \"true\",
      \"user\": \"$GMAIL_USER\",
      \"password\": \"$GMAIL_PASS\"
    }
  }" && echo "Done. Keycloak realm \"$REALM\" updated."
