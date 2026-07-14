-- Profile picture support: uploaded avatar stored server-side by user-service
-- (services/user, uploads_dir/avatars/), column stores the relative path
-- (e.g. "avatars/<uuid>.jpg"), same convention as registration-service's
-- payment-screenshot storage.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/023_user_avatar.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
