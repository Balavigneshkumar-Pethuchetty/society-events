-- =============================================================================
-- Society Events — Database Schema
-- PostgreSQL 16 | Runs automatically on first container start
-- =============================================================================

\c society_events;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram search on event titles

-- ---------------------------------------------------------------------------
-- SOCIETY  (top-level tenant; supports multi-society SaaS later)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS society (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    address         TEXT        NOT NULL,
    city            VARCHAR(100) NOT NULL,
    contact_email   VARCHAR(255) NOT NULL,
    base_currency   CHAR(3)     NOT NULL DEFAULT 'INR',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- APARTMENT  (a flat / villa inside a society)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS apartment (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id  UUID        NOT NULL REFERENCES society(id) ON DELETE CASCADE,
    block       VARCHAR(10) NOT NULL,
    unit_number VARCHAR(20) NOT NULL,
    type        VARCHAR(50) NOT NULL,         -- '1BHK' | '2BHK' | '3BHK' | 'Villa'
    UNIQUE (society_id, block, unit_number)
);

-- ---------------------------------------------------------------------------
-- USERS  ('user' is reserved in SQL; table is 'users')
-- keycloak_sub = the immutable 'sub' claim from every Keycloak JWT.
-- password_hash is intentionally absent — Keycloak owns credentials.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    apartment_id        UUID        REFERENCES apartment(id) ON DELETE SET NULL,
    name                VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    phone               VARCHAR(20),
    role                VARCHAR(50) NOT NULL DEFAULT 'resident',
                        -- 'admin' | 'committee_member' | 'resident' | 'security_guard'
    keycloak_sub        VARCHAR(255) UNIQUE,  -- Keycloak user UUID (sub claim)
    identity_provider   VARCHAR(50) NOT NULL DEFAULT 'keycloak',
                        -- 'keycloak' | 'google' | 'facebook' | 'apple'
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- OAUTH_SESSION  (optional — tracks active refresh tokens per device)
-- Enables "log out all devices" and refresh-token reuse detection.
-- You can skip this and rely solely on Keycloak's session management.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_session (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token_jti    VARCHAR(255) NOT NULL UNIQUE,  -- JWT 'jti' claim
    refresh_token_hash  VARCHAR(255),                  -- SHA-256 of the refresh token
    device_info         TEXT,
    ip_address          INET,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- CURRENCY  (ISO 4217 lookup; seed with INR + common NRI currencies)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS currency (
    code        CHAR(3)     PRIMARY KEY,        -- 'INR', 'USD', 'GBP', …
    name        VARCHAR(100) NOT NULL,
    symbol      VARCHAR(10) NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    is_base     BOOLEAN     NOT NULL DEFAULT FALSE   -- exactly one row = TRUE (INR)
);

-- ---------------------------------------------------------------------------
-- EXCHANGE_RATE  (historical; one row per rate snapshot)
-- Both original and settled amounts on PAYMENT reference the rate locked
-- at payment time — critical for accounting accuracy.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exchange_rate (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency   CHAR(3)     NOT NULL REFERENCES currency(code),
    to_currency     CHAR(3)     NOT NULL REFERENCES currency(code),
    rate            NUMERIC(18,8) NOT NULL,
    source          VARCHAR(100) NOT NULL DEFAULT 'manual',   -- 'RBI'|'openexchangerates'|'manual'
    valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to        TIMESTAMPTZ,                              -- NULL = currently active
    CONSTRAINT chk_diff_currency CHECK (from_currency <> to_currency)
);

-- ---------------------------------------------------------------------------
-- EVENT_CATEGORY
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_category (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id  UUID        NOT NULL REFERENCES society(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    icon        VARCHAR(100),
    color_hex   CHAR(7)
);

-- ---------------------------------------------------------------------------
-- EVENT
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id      UUID        NOT NULL REFERENCES society(id) ON DELETE CASCADE,
    category_id     UUID        REFERENCES event_category(id) ON DELETE SET NULL,
    organizer_id    UUID        NOT NULL REFERENCES users(id),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    venue           VARCHAR(255) NOT NULL,
    capacity        INTEGER,
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',
                    -- 'draft' | 'published' | 'cancelled' | 'completed'
    ticket_price    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    price_currency  CHAR(3)     NOT NULL DEFAULT 'INR' REFERENCES currency(code),
    is_free         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_end_after_start CHECK (end_time > start_time),
    CONSTRAINT chk_price_positive  CHECK (ticket_price >= 0)
);

-- ---------------------------------------------------------------------------
-- REGISTRATION  (one per user per event; ticket_count covers family members)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registration (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id         UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    user_id          UUID        NOT NULL REFERENCES users(id),
    ticket_count     INTEGER     NOT NULL DEFAULT 1 CHECK (ticket_count > 0),
    total_amount     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    display_currency CHAR(3)     NOT NULL DEFAULT 'INR' REFERENCES currency(code),
    status           VARCHAR(50) NOT NULL DEFAULT 'pending',
                     -- 'pending' | 'confirmed' | 'cancelled' | 'attended'
    qr_code          TEXT,                              -- base64 QR or short token
    registered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)
);

-- ---------------------------------------------------------------------------
-- PAYMENT  (two-amount design: original (user-facing) + settled (INR))
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id     UUID        NOT NULL REFERENCES registration(id),
    gateway_name        VARCHAR(100) NOT NULL,          -- 'razorpay' | 'cashfree' | 'stripe'
    gateway_order_id    VARCHAR(255),
    gateway_txn_id      VARCHAR(255) UNIQUE,
    original_amount     NUMERIC(10,2) NOT NULL,         -- amount shown to user
    original_currency   CHAR(3)     NOT NULL REFERENCES currency(code),
    settled_amount      NUMERIC(10,2) NOT NULL,         -- amount credited to bank (INR)
    settled_currency    CHAR(3)     NOT NULL DEFAULT 'INR' REFERENCES currency(code),
    exchange_rate_used  NUMERIC(18,8) NOT NULL DEFAULT 1.0,
    exchange_rate_id    UUID        REFERENCES exchange_rate(id),
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
                        -- 'pending' | 'success' | 'failed' | 'refunded'
    gateway_response    JSONB,                          -- full webhook payload
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- REFUND  (mirrors the two-amount pattern from PAYMENT)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refund (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id              UUID        NOT NULL REFERENCES payment(id),
    initiated_by            UUID        NOT NULL REFERENCES users(id),
    original_refund_amount  NUMERIC(10,2) NOT NULL,
    original_currency       CHAR(3)     NOT NULL REFERENCES currency(code),
    settled_refund_amount   NUMERIC(10,2) NOT NULL,
    settled_currency        CHAR(3)     NOT NULL DEFAULT 'INR' REFERENCES currency(code),
    reason                  TEXT,
    status                  VARCHAR(50) NOT NULL DEFAULT 'pending',
                            -- 'pending' | 'processed' | 'failed'
    gateway_refund_id       VARCHAR(255),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- ANNOUNCEMENT  (broadcast message to all registrants of an event)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcement (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    author_id   UUID        NOT NULL REFERENCES users(id),
    title       VARCHAR(255) NOT NULL,
    body        TEXT        NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- NOTIFICATION  (per-user inbox; drives the bell icon in the UI)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id    UUID        REFERENCES event(id) ON DELETE SET NULL,
    type        VARCHAR(100) NOT NULL,
                -- 'registration_confirmed' | 'payment_success' | 'event_reminder'
                -- 'event_cancelled' | 'refund_processed' | 'announcement'
    title       VARCHAR(255) NOT NULL,
    message     TEXT        NOT NULL,
    is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES  (add before seed so they're built once, not rebuilt per INSERT)
-- =============================================================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_keycloak_sub  ON users(keycloak_sub);
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);

-- apartment
CREATE INDEX IF NOT EXISTS idx_apartment_society    ON apartment(society_id);

-- event
CREATE INDEX IF NOT EXISTS idx_event_society        ON event(society_id);
CREATE INDEX IF NOT EXISTS idx_event_status         ON event(status);
CREATE INDEX IF NOT EXISTS idx_event_start_time     ON event(start_time);
CREATE INDEX IF NOT EXISTS idx_event_title_trgm     ON event USING gin(title gin_trgm_ops);

-- registration
CREATE INDEX IF NOT EXISTS idx_reg_event            ON registration(event_id);
CREATE INDEX IF NOT EXISTS idx_reg_user             ON registration(user_id);
CREATE INDEX IF NOT EXISTS idx_reg_status           ON registration(status);

-- payment
CREATE INDEX IF NOT EXISTS idx_pay_registration     ON payment(registration_id);
CREATE INDEX IF NOT EXISTS idx_pay_status           ON payment(status);
CREATE INDEX IF NOT EXISTS idx_pay_gateway_txn      ON payment(gateway_txn_id);

-- notification
CREATE INDEX IF NOT EXISTS idx_notif_user_unread    ON notification(user_id, is_read)
    WHERE is_read = FALSE;

-- exchange_rate
CREATE INDEX IF NOT EXISTS idx_exrate_lookup        ON exchange_rate(from_currency, to_currency, valid_from DESC);

-- oauth_session
CREATE INDEX IF NOT EXISTS idx_session_user         ON oauth_session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_expires      ON oauth_session(expires_at);
