-- =============================================================================
-- Migration 004: unit_assignment_requests
--
-- Residents can submit a request to be assigned (or moved) to a flat/unit.
-- Admins and committee members can approve or reject the request; on approval
-- the user's structure_node_id is updated automatically.
--
-- Fully idempotent — safe to run multiple times.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS unit_assignment_requests (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_id     UUID        NOT NULL REFERENCES structure_nodes(id) ON DELETE CASCADE,
    notes       TEXT,
    type        VARCHAR(10) NOT NULL DEFAULT 'add'
                CHECK (type IN ('add', 'remove')),
    status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unit_requests_user   ON unit_assignment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_unit_requests_status ON unit_assignment_requests(status);
CREATE INDEX IF NOT EXISTS idx_unit_requests_node   ON unit_assignment_requests(node_id);

COMMIT;
