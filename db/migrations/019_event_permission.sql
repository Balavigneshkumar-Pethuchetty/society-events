-- Per-event delegation: an organizer can grant another user access to their specific
-- event (fund visibility, event management) without granting access to any other event.
-- Inert until routes are added to read/write it — this migration is schema-only.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/019_event_permission.sql

CREATE TABLE IF NOT EXISTS event_permission (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     UUID        NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by   UUID        NOT NULL REFERENCES users(id),
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at   TIMESTAMPTZ,
    UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_permission_event ON event_permission(event_id);
CREATE INDEX IF NOT EXISTS idx_event_permission_user  ON event_permission(user_id);
