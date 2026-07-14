-- Backfill: grant every current admin/committee_member an event_permission row on every
-- event that already exists, so the new "organizer + approved members only" isolation model
-- doesn't suddenly take away access that's in active use today. Only affects events that
-- exist at migration time — events created after this runs start isolated from day one,
-- visible only to their organizer until explicitly shared.
--
-- Data-only migration (no schema change) — not mirrored into db/init/01_schema.sql, since a
-- fresh install has no pre-existing events/admins to backfill access for.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/021_event_permission_backfill.sql

INSERT INTO event_permission (event_id, user_id, granted_by, granted_at)
SELECT e.id, u.id, e.organizer_id, now()
FROM event e
CROSS JOIN users u
WHERE u.role IN ('admin', 'committee_member')
  AND u.id != e.organizer_id
ON CONFLICT (event_id, user_id) DO NOTHING;
