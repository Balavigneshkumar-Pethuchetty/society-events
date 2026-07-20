-- Per-event email-parsing (IMAP) config, moved off the single global settings row.
-- committee_registry already holds one row per event (UNIQUE(event_id)) with the
-- collector + UPI ID; this adds that same event's own mailbox credentials so an
-- event organizer can point auto-reconciliation at their own inbox.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/028_event_reconciliation_config.sql

ALTER TABLE committee_registry
    ADD COLUMN IF NOT EXISTS imap_host     VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS imap_port     INT          NOT NULL DEFAULT 993,
    ADD COLUMN IF NOT EXISTS imap_user     VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS imap_password TEXT         NOT NULL DEFAULT '',  -- Fernet-encrypted ciphertext, never plaintext
    ADD COLUMN IF NOT EXISTS imap_mailbox  VARCHAR(100) NOT NULL DEFAULT 'INBOX';

-- Global IMAP config is superseded by the per-event columns above; the settings row
-- keeps only deployment-wide scan cadence + AI-parser infra config.
ALTER TABLE payment_reconciliation_settings
    DROP COLUMN IF EXISTS imap_host,
    DROP COLUMN IF EXISTS imap_port,
    DROP COLUMN IF EXISTS imap_user,
    DROP COLUMN IF EXISTS imap_password,
    DROP COLUMN IF EXISTS imap_mailbox;
