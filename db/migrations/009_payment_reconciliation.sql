-- Payment & Reconciliation Service schema
-- Adds: committee_registry, payment_transaction, payment_audit_log
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/009_payment_reconciliation.sql

-- Committee registry: one collector (committee member + UPI ID) per event
CREATE TABLE IF NOT EXISTS committee_registry (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID         NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    member_id   UUID         NOT NULL REFERENCES users(id),
    upi_id      VARCHAR(100) NOT NULL,
    assigned_by UUID         REFERENCES users(id),
    assigned_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT committee_registry_event_unique UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_committee_registry_event_id  ON committee_registry (event_id);
CREATE INDEX IF NOT EXISTS idx_committee_registry_member_id ON committee_registry (member_id);

-- Payment transaction: one per resident payment attempt
-- Status lifecycle: pending → verified → refund_requested → refunded
CREATE TABLE IF NOT EXISTS payment_transaction (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    txn_ref          VARCHAR(24)   NOT NULL,
    event_id         UUID          NOT NULL REFERENCES event(id),
    registration_id  UUID          REFERENCES registration(id) ON DELETE SET NULL,
    user_id          UUID          NOT NULL REFERENCES users(id),
    amount           NUMERIC(12,2) NOT NULL,
    currency         VARCHAR(10)   NOT NULL DEFAULT 'INR',
    payee_upi        VARCHAR(100),
    payer_upi        VARCHAR(100),
    status           VARCHAR(30)   NOT NULL DEFAULT 'pending',
    payment_utr      VARCHAR(100),
    refund_utr       VARCHAR(100),
    idempotency_key  VARCHAR(200)  NOT NULL,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT payment_txn_ref_unique     UNIQUE (txn_ref),
    CONSTRAINT payment_idempotency_unique UNIQUE (idempotency_key),
    CONSTRAINT payment_status_check       CHECK (status IN (
        'pending', 'verified', 'refund_requested', 'refunded', 'cancelled'
    ))
);

CREATE INDEX IF NOT EXISTS idx_payment_txn_event_id        ON payment_transaction (event_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_user_id         ON payment_transaction (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_registration_id ON payment_transaction (registration_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_status          ON payment_transaction (status);
CREATE INDEX IF NOT EXISTS idx_payment_txn_payment_utr     ON payment_transaction (payment_utr);

-- Audit log: append-only state-transition trail (NFR-02)
CREATE TABLE IF NOT EXISTS payment_audit_log (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    txn_id      UUID         NOT NULL REFERENCES payment_transaction(id) ON DELETE CASCADE,
    from_status VARCHAR(30),
    to_status   VARCHAR(30)  NOT NULL,
    updated_by  VARCHAR(200) NOT NULL,  -- 'system_auto' or user UUID string
    note        TEXT,
    at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_txn_id ON payment_audit_log (txn_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_at     ON payment_audit_log (at DESC);
