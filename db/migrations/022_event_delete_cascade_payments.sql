-- Lets an organizer/approved member delete a completed event, with everything tied to it
-- (registrations, tickets, payment records, expenses, sponsorships, etc.) removed together.
-- Pre-launch decision: no production data to preserve yet, so this is a full cascade rather
-- than the more involved "keep payment/attendance history, orphan the rows" approach.
--
-- payment_transaction.event_id was the only FK still blocking event deletion (NOT NULL, no
-- ON DELETE clause = RESTRICT) — registration/ticket/complimentary_ticket/etc. already
-- cascade-delete with their event.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/022_event_delete_cascade_payments.sql

ALTER TABLE payment_transaction DROP CONSTRAINT payment_transaction_event_id_fkey;
ALTER TABLE payment_transaction ADD CONSTRAINT payment_transaction_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES event(id) ON DELETE CASCADE;
