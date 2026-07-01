-- Lets a complimentary ticket be emailed to its recipient (QR + event details).
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/013_complimentary_guest_email.sql

ALTER TABLE complimentary_ticket ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255);
ALTER TABLE complimentary_ticket ADD COLUMN IF NOT EXISTS emailed_at   TIMESTAMPTZ;
