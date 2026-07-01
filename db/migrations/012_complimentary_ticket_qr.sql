-- Extends the existing (schema-only, never wired up) complimentary_ticket
-- table so named guest entries (organizer/committee_member/sponsor) can carry
-- a real registration + ticket, making them scannable at the gate like a paid
-- ticket. Walk-in entries are unaffected — they keep these columns NULL and
-- stay a pure headcount log, as the table's original design already implied.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/012_complimentary_ticket_qr.sql

ALTER TABLE complimentary_ticket
    ADD COLUMN IF NOT EXISTS registration_id UUID REFERENCES registration(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS guest_user_id   UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS guest_name      VARCHAR(255),
    ADD COLUMN IF NOT EXISTS cancelled_at    TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'complimentary_ticket_reg_unique'
    ) THEN
        ALTER TABLE complimentary_ticket
            ADD CONSTRAINT complimentary_ticket_reg_unique UNIQUE (registration_id);
    END IF;
END $$;
