-- =============================================================================
-- Migration 002: Mobile OTP Login Support
-- Adds: username column (unique), makes email nullable (phone-only accounts),
--       adds UNIQUE constraint to phone, and partial email index.
--
-- Safe to run multiple times — all operations use IF NOT EXISTS / DO $$ guards.
-- Run: psql -U society_user -d society_events -f db/migrations/002_mobile_otp.sql
-- =============================================================================

BEGIN;

-- 1. Add username column (nullable so existing rows don't break)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS username VARCHAR(255);

-- 2. Unique constraint on username
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
    END IF;
END$$;

-- 3. Drop NOT NULL on email — phone-only accounts have no email
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 4. Replace the column-level UNIQUE on email with a partial index
--    (NULL values are allowed; uniqueness only applies where email IS NOT NULL)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_email_key;
    END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users(email)
    WHERE email IS NOT NULL;

-- 5. UNIQUE constraint on phone (prevents duplicate phone registrations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_unique'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);
    END IF;
END$$;

-- 6. Indexes for fast OTP login lookups
CREATE INDEX IF NOT EXISTS idx_users_phone    ON users(phone)    WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

COMMIT;
