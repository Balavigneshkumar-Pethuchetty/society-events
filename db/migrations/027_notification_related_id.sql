-- Generic entity reference on notification rows, so a "New User Registration" /
-- "New Leave Request" admin notification can be programmatically deleted once
-- the underlying pending item is resolved (approved/rejected/revoked) --
-- see services/user/app/routes/users.py (approve_user/reject_user) and
-- services/user/app/routes/leave_requests.py (approve/reject/revoke).
-- Deliberately not a FK -- it points at different tables depending on `type`.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/027_notification_related_id.sql

ALTER TABLE notification ADD COLUMN IF NOT EXISTS related_id UUID;
CREATE INDEX IF NOT EXISTS idx_notification_related_id ON notification(related_id);
