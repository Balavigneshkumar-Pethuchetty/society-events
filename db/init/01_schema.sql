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
                        -- 'admin' | 'committee_member' | 'resident' | 'security_guard' | 'sponsor'
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

-- =============================================================================
-- SPONSOR  (organizations or individuals who sponsor events)
-- user_id links to a users row when the sponsor also has a platform account.
-- =============================================================================
CREATE TABLE IF NOT EXISTS sponsor (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        REFERENCES users(id) ON DELETE SET NULL,
    organization_name   VARCHAR(255) NOT NULL,
    organization_type   VARCHAR(50)  NOT NULL DEFAULT 'private',
                        -- 'public' | 'private' | 'ngo' | 'individual'
    contact_name        VARCHAR(255),
    contact_email       VARCHAR(255),
    contact_phone       VARCHAR(20),
    logo_url            TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- EVENT_SPONSORSHIP  (one sponsor ↔ one event per row; multiple sponsors OK)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_sponsorship (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    sponsor_id          UUID        NOT NULL REFERENCES sponsor(id) ON DELETE CASCADE,
    amount              NUMERIC(12,2) NOT NULL,
    currency_code       CHAR(3)     NOT NULL DEFAULT 'INR' REFERENCES currency(code),
    status              VARCHAR(50) NOT NULL DEFAULT 'pledged',
                        -- 'pledged' | 'received' | 'refund_requested' | 'refunded'
    payment_reference   VARCHAR(255),
    notes               TEXT,
    sponsored_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_sponsorship_amount CHECK (amount > 0),
    UNIQUE (event_id, sponsor_id)
);

-- ---------------------------------------------------------------------------
-- SPONSORSHIP_REFUND  (sponsor raises request; organizer/admin approves)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sponsorship_refund (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sponsorship_id      UUID        NOT NULL REFERENCES event_sponsorship(id) ON DELETE CASCADE,
    requested_by        UUID        NOT NULL REFERENCES users(id),
    amount              NUMERIC(12,2) NOT NULL,
    currency_code       CHAR(3)     NOT NULL DEFAULT 'INR' REFERENCES currency(code),
    reason              TEXT,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
                        -- 'pending' | 'approved' | 'rejected' | 'processed'
    reviewed_by         UUID        REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_refund_amount CHECK (amount > 0)
);

-- ---------------------------------------------------------------------------
-- EVENT_EXPENSE  (cost items logged by organizer; drives the finance view)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_expense (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    description     VARCHAR(255) NOT NULL,
    amount          NUMERIC(10,2) NOT NULL,
    currency_code   CHAR(3)     NOT NULL DEFAULT 'INR' REFERENCES currency(code),
    category        VARCHAR(50) NOT NULL DEFAULT 'other',
                    -- 'venue' | 'catering' | 'equipment' | 'marketing' | 'staff' | 'other'
    receipt_url     TEXT,
    created_by      UUID        NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_expense_amount CHECK (amount > 0)
);

-- ---------------------------------------------------------------------------
-- COMPLIMENTARY_TICKET  (free-entry allocation managed by organizer)
-- invited_by_user_id is NULL for walk_in entries — no account required.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complimentary_ticket (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    invited_by_user_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
    inviter_type        VARCHAR(50) NOT NULL,
                        -- 'organizer' | 'committee_member' | 'sponsor' | 'walk_in'
    ticket_count        INTEGER     NOT NULL DEFAULT 1,
    notes               TEXT,
    created_by          UUID        NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_comp_ticket_count CHECK (ticket_count > 0)
);

-- =============================================================================
-- INDEXES — new tables
-- =============================================================================

-- sponsor
CREATE INDEX IF NOT EXISTS idx_sponsor_user         ON sponsor(user_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_active       ON sponsor(is_active);

-- event_sponsorship
CREATE INDEX IF NOT EXISTS idx_esponsor_event       ON event_sponsorship(event_id);
CREATE INDEX IF NOT EXISTS idx_esponsor_sponsor     ON event_sponsorship(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_esponsor_status      ON event_sponsorship(status);

-- sponsorship_refund
CREATE INDEX IF NOT EXISTS idx_srefund_sponsorship  ON sponsorship_refund(sponsorship_id);
CREATE INDEX IF NOT EXISTS idx_srefund_status       ON sponsorship_refund(status);

-- event_expense
CREATE INDEX IF NOT EXISTS idx_expense_event        ON event_expense(event_id);
CREATE INDEX IF NOT EXISTS idx_expense_category     ON event_expense(category);

-- complimentary_ticket
CREATE INDEX IF NOT EXISTS idx_compticket_event     ON complimentary_ticket(event_id);
CREATE INDEX IF NOT EXISTS idx_compticket_inviter   ON complimentary_ticket(invited_by_user_id);

-- =============================================================================
-- VENDOR  (shops / stalls invited to an event)
-- =============================================================================
CREATE TABLE IF NOT EXISTS vendor (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id      UUID        NOT NULL REFERENCES society(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    category        VARCHAR(50) NOT NULL DEFAULT 'other',
                    -- 'food' | 'beverages' | 'merchandise' | 'games' | 'services' | 'other'
    contact_name    VARCHAR(255),
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(20),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- EVENT_VENDOR  (link a vendor to a specific event; includes fee arrangement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_vendor (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    vendor_id           UUID        NOT NULL REFERENCES vendor(id) ON DELETE CASCADE,
    stall_number        VARCHAR(20),
    fee_type            VARCHAR(50) NOT NULL DEFAULT 'fixed',
                        -- 'fixed' | 'revenue_share' | 'free'
    fixed_fee           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    revenue_share_pct   NUMERIC(5,2) NOT NULL DEFAULT 0.00,
                        -- percentage of vendor's gross revenue paid to the society
    actual_revenue      NUMERIC(12,2),   -- filled in after event completes
    status              VARCHAR(50) NOT NULL DEFAULT 'invited',
                        -- 'invited' | 'confirmed' | 'cancelled'
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ev_fixed_fee      CHECK (fixed_fee >= 0),
    CONSTRAINT chk_ev_share_pct      CHECK (revenue_share_pct >= 0 AND revenue_share_pct <= 100),
    UNIQUE (event_id, vendor_id)
);

-- ---------------------------------------------------------------------------
-- VENDOR_REVENUE_DISTRIBUTION  (pool collected from vendors for an event)
-- Once organizer approves, individual distribution_entry rows are created.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_revenue_distribution (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    total_pool      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    currency_code   CHAR(3)     NOT NULL DEFAULT 'INR' REFERENCES currency(code),
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',
                    -- 'draft' | 'approved' | 'distributed'
    approved_by     UUID        REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    distributed_at  TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_vrd_pool CHECK (total_pool >= 0),
    UNIQUE (event_id)
);

-- ---------------------------------------------------------------------------
-- DISTRIBUTION_ENTRY  (individual payout line inside a revenue distribution)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distribution_entry (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    distribution_id     UUID        NOT NULL REFERENCES vendor_revenue_distribution(id) ON DELETE CASCADE,
    recipient_type      VARCHAR(50) NOT NULL,
                        -- 'sponsor' | 'organizer' | 'resident' | 'society'
    recipient_user_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
    recipient_sponsor_id UUID       REFERENCES sponsor(id) ON DELETE SET NULL,
    share_percentage    NUMERIC(5,2) NOT NULL,
    amount              NUMERIC(12,2) NOT NULL,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
                        -- 'pending' | 'paid'
    paid_at             TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_de_pct    CHECK (share_percentage > 0 AND share_percentage <= 100),
    CONSTRAINT chk_de_amount CHECK (amount >= 0)
);

-- =============================================================================
-- TICKET_TYPE  (named tiers per event: e.g. Breakfast, Lunch, Games Pass)
-- An event with no ticket_type rows falls back to the single-price legacy flow.
-- =============================================================================
CREATE TABLE IF NOT EXISTS ticket_type (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,   -- 'General Entry', 'Dinner', 'Games Pass', …
    description TEXT,
    price       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    is_free     BOOLEAN     NOT NULL DEFAULT FALSE,
    capacity    INTEGER,                 -- NULL = unlimited
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_tt_price CHECK (price >= 0),
    UNIQUE (event_id, name)
);

-- ---------------------------------------------------------------------------
-- REGISTRATION_ITEM  (line item within a registration for multi-type tickets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registration_item (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID        NOT NULL REFERENCES registration(id) ON DELETE CASCADE,
    ticket_type_id  UUID        NOT NULL REFERENCES ticket_type(id),
    quantity        INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_price     NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ri_price CHECK (unit_price >= 0),
    UNIQUE (registration_id, ticket_type_id)
);

-- ---------------------------------------------------------------------------
-- FREE_TOKEN  (organizer issues free-entry tokens; usable by anyone)
-- issued_to_name / issued_to_email are optional — walk-in tokens need neither.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS free_token (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    ticket_type_id      UUID        REFERENCES ticket_type(id) ON DELETE SET NULL,
    token_code          VARCHAR(50) NOT NULL UNIQUE,   -- short unique code shown to recipient
    issued_to_name      VARCHAR(255),
    issued_to_email     VARCHAR(255),
    issued_by           UUID        NOT NULL REFERENCES users(id),
    is_used             BOOLEAN     NOT NULL DEFAULT FALSE,
    used_at             TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES — vendor + ticket tables
-- =============================================================================

-- vendor
CREATE INDEX IF NOT EXISTS idx_vendor_society       ON vendor(society_id);
CREATE INDEX IF NOT EXISTS idx_vendor_category      ON vendor(category);

-- event_vendor
CREATE INDEX IF NOT EXISTS idx_evendor_event        ON event_vendor(event_id);
CREATE INDEX IF NOT EXISTS idx_evendor_vendor       ON event_vendor(vendor_id);
CREATE INDEX IF NOT EXISTS idx_evendor_status       ON event_vendor(status);

-- vendor_revenue_distribution
CREATE INDEX IF NOT EXISTS idx_vrd_event            ON vendor_revenue_distribution(event_id);
CREATE INDEX IF NOT EXISTS idx_vrd_status           ON vendor_revenue_distribution(status);

-- distribution_entry
CREATE INDEX IF NOT EXISTS idx_distentry_dist       ON distribution_entry(distribution_id);
CREATE INDEX IF NOT EXISTS idx_distentry_user       ON distribution_entry(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_distentry_sponsor    ON distribution_entry(recipient_sponsor_id);

-- ticket_type
CREATE INDEX IF NOT EXISTS idx_ticktype_event       ON ticket_type(event_id);
CREATE INDEX IF NOT EXISTS idx_ticktype_sort        ON ticket_type(event_id, sort_order);

-- registration_item
CREATE INDEX IF NOT EXISTS idx_regitem_registration ON registration_item(registration_id);
CREATE INDEX IF NOT EXISTS idx_regitem_ticktype     ON registration_item(ticket_type_id);

-- free_token
CREATE INDEX IF NOT EXISTS idx_freetoken_event      ON free_token(event_id);
CREATE INDEX IF NOT EXISTS idx_freetoken_code       ON free_token(token_code);
CREATE INDEX IF NOT EXISTS idx_freetoken_used       ON free_token(is_used);

-- =============================================================================
-- FINANCE SUMMARY VIEW  (per-event income, expenses, and complimentary count)
-- Now includes vendor revenue in net_balance calculation.
-- =============================================================================
CREATE OR REPLACE VIEW v_event_finance AS
SELECT
    e.id                                                        AS event_id,
    e.title,
    e.status,
    COALESCE(SUM(DISTINCT r.total_amount), 0)                  AS ticket_revenue,
    COALESCE(
        (SELECT SUM(es2.amount) FROM event_sponsorship es2
         WHERE es2.event_id = e.id AND es2.status = 'received'), 0)
                                                                AS sponsorship_income,
    COALESCE(
        (SELECT SUM(ex2.amount) FROM event_expense ex2
         WHERE ex2.event_id = e.id), 0)                        AS total_expenses,
    COALESCE(
        (SELECT vrd.total_pool FROM vendor_revenue_distribution vrd
         WHERE vrd.event_id = e.id), 0)                        AS vendor_pool,
    COALESCE(
        (SELECT SUM(es3.amount) FROM event_sponsorship es3
         WHERE es3.event_id = e.id AND es3.status = 'received'), 0)
    + COALESCE(SUM(DISTINCT r.total_amount), 0)
    + COALESCE(
        (SELECT vrd2.total_pool FROM vendor_revenue_distribution vrd2
         WHERE vrd2.event_id = e.id), 0)
    - COALESCE(
        (SELECT SUM(ex3.amount) FROM event_expense ex3
         WHERE ex3.event_id = e.id), 0)                        AS net_balance,
    COALESCE(
        (SELECT COUNT(*) FROM event_sponsorship es4
         WHERE es4.event_id = e.id), 0)                        AS sponsor_count,
    COALESCE(
        (SELECT SUM(ct.ticket_count) FROM complimentary_ticket ct
         WHERE ct.event_id = e.id), 0)                         AS complimentary_tickets,
    COALESCE(
        (SELECT COUNT(*) FROM free_token ft
         WHERE ft.event_id = e.id), 0)                         AS free_tokens_issued
FROM event e
LEFT JOIN registration r ON r.event_id = e.id AND r.status = 'confirmed'
GROUP BY e.id, e.title, e.status
ORDER BY e.start_time;
