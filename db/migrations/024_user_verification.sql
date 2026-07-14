-- Email/phone verification status.
-- email_verified mirrors Keycloak's own emailVerified flag (kept in sync via
-- the "email_verified" JWT claim on every /users/sync, plus an explicit
-- refresh endpoint since Keycloak's link-based flow completes out-of-band).
-- phone_verified is tracked entirely locally, set true only after a
-- confirmed OTP round-trip via ~/auth-service's turnkey OTP API
-- (POST /api/otp/request + /api/otp/verify) — reset to false whenever the
-- phone number on file changes.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/024_user_verification.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
