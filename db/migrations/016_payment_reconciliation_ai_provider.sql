-- Adds a Claude (Anthropic) option alongside the existing Ollama email parser.
-- use_ai_parser stays the master AI on/off switch (false = regex only, unchanged);
-- ai_provider selects which AI backend when use_ai_parser is true. Existing rows
-- default to 'ollama', preserving current behavior exactly.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/016_payment_reconciliation_ai_provider.sql

ALTER TABLE payment_reconciliation_settings
    ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(20) NOT NULL DEFAULT 'ollama';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ai_provider_check'
    ) THEN
        ALTER TABLE payment_reconciliation_settings
            ADD CONSTRAINT ai_provider_check CHECK (ai_provider IN ('ollama', 'claude'));
    END IF;
END $$;
