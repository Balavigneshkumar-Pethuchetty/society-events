-- Persist the admin/committee's refund-transfer screenshot (uploaded via
-- POST /refunds/{txn_ref}/verify-screenshot) alongside the resident's original payment
-- screenshot (payment_transaction.screenshot_path) — previously the refund screenshot was
-- only ever forwarded to the external reconciliation service for AI verification and never
-- saved locally, so there was no way to look back at proof of the outgoing transfer next to
-- proof of the incoming payment.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/018_refund_screenshot.sql

ALTER TABLE payment_transaction ADD COLUMN IF NOT EXISTS refund_screenshot_path TEXT;
