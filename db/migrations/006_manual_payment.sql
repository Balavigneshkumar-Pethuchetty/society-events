-- Adds manual screenshot-based payment support.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events -f /dev/stdin < db/migrations/006_manual_payment.sql

ALTER TABLE payment ADD COLUMN IF NOT EXISTS payment_method  VARCHAR(50)  DEFAULT 'online';
ALTER TABLE payment ADD COLUMN IF NOT EXISTS screenshot_path TEXT;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS utr_number      VARCHAR(100);
ALTER TABLE payment ADD COLUMN IF NOT EXISTS review_notes    TEXT;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS reviewed_by     UUID         REFERENCES users(id);
ALTER TABLE payment ADD COLUMN IF NOT EXISTS reviewed_at     TIMESTAMPTZ;
