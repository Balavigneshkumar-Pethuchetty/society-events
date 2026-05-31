#!/bin/bash
set -e
KC_DB="${KEYCLOAK_DB:-keycloak}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
  CREATE DATABASE "${KC_DB}";
  GRANT ALL PRIVILEGES ON DATABASE "${KC_DB}" TO "$POSTGRES_USER";
EOSQL
