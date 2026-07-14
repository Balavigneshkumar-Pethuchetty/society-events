-- Bridge sessions for phone-OTP login (already-registered, phone-verified
-- users only — see services/user/app/routes/users.py's /auth/phone-login/*
-- endpoints). Token exchange via ~/auth-service's otp-bridge Keycloak client
-- returns no refresh_token, so this opaque session token lets the frontend
-- silently re-mint a fresh short-lived Keycloak access token (no OTP needed)
-- until the session itself expires or is logged out.
-- Only a hash of the session token is stored, never the token itself.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/025_otp_login_sessions.sql

CREATE TABLE IF NOT EXISTS otp_login_sessions (
    session_token_hash TEXT PRIMARY KEY,
    keycloak_sub        TEXT NOT NULL,
    phone                TEXT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_login_sessions_expires_at ON otp_login_sessions (expires_at);
