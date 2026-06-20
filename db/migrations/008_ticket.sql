-- Ticket table: one ticket issued per confirmed registration
-- Owns QR tokens, gate-scan state, and attendance tracking.
-- The ticket service lazily issues tickets for confirmed registrations.
CREATE TABLE IF NOT EXISTS ticket (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reg_id      UUID        NOT NULL REFERENCES registration(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
    event_id    UUID        NOT NULL REFERENCES event(id)        ON DELETE CASCADE,
    qr_token    TEXT        UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status      VARCHAR(20) NOT NULL DEFAULT 'active',
    scanned_at  TIMESTAMPTZ,
    scanned_by  UUID REFERENCES users(id),
    CONSTRAINT ticket_reg_unique   UNIQUE (reg_id),
    CONSTRAINT ticket_status_check CHECK  (status IN ('active', 'used', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_user_id  ON ticket (user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_event_id ON ticket (event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_qr_token ON ticket (qr_token);
