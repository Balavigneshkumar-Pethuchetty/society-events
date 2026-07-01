-- Lets an organizer/committee member configure, per event, the last moment a
-- resident may self-cancel a confirmed ticket. NULL means self-cancellation is
-- not enabled for that event. Enforced in the application layer to always be
-- before the event's start_time.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/011_ticket_cancel_freeze.sql

ALTER TABLE event ADD COLUMN IF NOT EXISTS cancel_freeze_at TIMESTAMPTZ;
