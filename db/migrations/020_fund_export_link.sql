-- Shareable, unauthenticated download link for an event's fund export (Excel/PDF) —
-- same pattern as ticket-service's public QR endpoint: an opaque token, no login required.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/020_fund_export_link.sql

CREATE TABLE IF NOT EXISTS fund_export_link (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    token       VARCHAR(64) NOT NULL UNIQUE,
    created_by  UUID        NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fund_export_link_event ON fund_export_link(event_id);
CREATE INDEX IF NOT EXISTS idx_fund_export_link_token  ON fund_export_link(token);
