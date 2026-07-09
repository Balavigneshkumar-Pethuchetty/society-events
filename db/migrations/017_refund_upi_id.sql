-- Lets a resident specify the UPI ID a refund should be paid TO at cancellation time
-- (previously the refund queue only had payer_upi — the UPI ID the ORIGINAL payment came
-- FROM, captured during checkout verification, which is often null and isn't necessarily
-- where the resident wants the refund sent). Admin's refund queue prefers refund_upi_id,
-- falling back to payer_upi when a resident cancels without providing one.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/017_refund_upi_id.sql

ALTER TABLE payment_transaction ADD COLUMN IF NOT EXISTS refund_upi_id VARCHAR(100);
