-- =============================================================================
-- Migration 005: user_units — many-to-many users ↔ structure_nodes (flats)
--
-- Replaces the single users.structure_node_id with a proper junction table so
-- any user (resident, admin, committee, security, sponsor) can own zero, one,
-- or multiple flats.
--
-- Fully idempotent — safe to run multiple times.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS user_units (
    user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_id  UUID        NOT NULL REFERENCES structure_nodes(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_user_units_user ON user_units(user_id);
CREATE INDEX IF NOT EXISTS idx_user_units_node ON user_units(node_id);

-- Migrate any existing single-unit assignments into the junction table
INSERT INTO user_units (user_id, node_id)
SELECT id, structure_node_id FROM users WHERE structure_node_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
