-- Allow a resident to hold multiple registrations for the same event
-- (e.g. buying an additional last-minute ticket for a guest/friend).
-- Previously blocked by a UNIQUE (event_id, user_id) constraint plus an
-- application-level 409 check; pending/incomplete registrations no longer
-- block a fresh purchase for the same event.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/010_multi_registration_per_event.sql

ALTER TABLE registration DROP CONSTRAINT IF EXISTS registration_event_id_user_id_key;
