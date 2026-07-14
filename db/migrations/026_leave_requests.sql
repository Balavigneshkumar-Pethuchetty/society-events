-- Self-service "leave society" workflow: resident requests -> admin
-- approves/rejects/revokes -> resident finalizes irreversible account +
-- data deletion from their own Profile page (see
-- services/user/app/routes/leave_requests.py). user_name/user_email are
-- snapshotted so this row remains a readable audit record after the
-- underlying users row is deleted (user_id/reviewed_by go NULL on delete).
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/026_leave_requests.sql

CREATE TABLE IF NOT EXISTS leave_request (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        REFERENCES users(id) ON DELETE SET NULL,
    user_name         VARCHAR(255) NOT NULL,
    user_email        VARCHAR(255),
    reason            TEXT,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','revoked','completed')),
    requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by_name  VARCHAR(255),
    reviewed_at       TIMESTAMPTZ,
    review_note       TEXT,
    completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_leave_request_user_id ON leave_request(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_request_status   ON leave_request(status);

-- Only one open (pending/approved) request per user at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_request_one_open
    ON leave_request(user_id) WHERE status IN ('pending','approved');
