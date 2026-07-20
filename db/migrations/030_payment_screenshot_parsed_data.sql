-- Store AI-extracted fields from the resident's payment screenshot (via the sibling
-- Payment Reconciliation service's /parseImage, called from
-- POST /payments/{txn_ref}/screenshot) alongside the screenshot itself — lets an
-- organizer/committee member just copy the extracted UTR/RRN and amount to search
-- their bank statement instead of squinting at the screenshot image. The screenshot
-- is always kept regardless of whether parsing succeeds, as the fallback source of truth.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/030_payment_screenshot_parsed_data.sql

ALTER TABLE payment_transaction ADD COLUMN IF NOT EXISTS parsed_amount NUMERIC(10, 2);
ALTER TABLE payment_transaction ADD COLUMN IF NOT EXISTS parsed_upi_ref VARCHAR(100);
ALTER TABLE payment_transaction ADD COLUMN IF NOT EXISTS parsed_rrn VARCHAR(100);
ALTER TABLE payment_transaction ADD COLUMN IF NOT EXISTS parsed_bank VARCHAR(100);
ALTER TABLE payment_transaction ADD COLUMN IF NOT EXISTS parsed_timestamp VARCHAR(100);
