-- =============================================================================
-- Migration 003: user_apartments table + building hierarchy structure
--
-- Covers two things:
--   1. user_apartments — many-to-many link between users and apartments.
--      Missing from DBs initialised before this table was added to 01_schema.sql.
--   2. building_hierarchy_config + structure_nodes — flexible building tree.
--   3. users.structure_node_id — FK linking a user to their specific unit node.
--
-- Fully idempotent — safe to run multiple times.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. user_apartments  (many-to-many: resident ↔ flat)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_apartments (
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    apartment_id  UUID        NOT NULL REFERENCES apartment(id) ON DELETE CASCADE,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, apartment_id)
);

CREATE INDEX IF NOT EXISTS idx_user_apartments_user ON user_apartments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_apartments_apt  ON user_apartments(apartment_id);

-- ---------------------------------------------------------------------------
-- 2. building_hierarchy_config  (admin-configurable level names)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS building_hierarchy_config (
    id          SERIAL      PRIMARY KEY,
    level_index INTEGER     NOT NULL UNIQUE CHECK (level_index >= 1),
    level_name  VARCHAR(50) NOT NULL,
    is_billable BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------------
-- 3. structure_nodes  (recursive tree; parent_id cascade-deletes children)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS structure_nodes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    level_index INTEGER     NOT NULL REFERENCES building_hierarchy_config(level_index) ON DELETE CASCADE,
    parent_id   UUID        REFERENCES structure_nodes(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_structure_nodes_parent ON structure_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_structure_nodes_level  ON structure_nodes(level_index);

-- ---------------------------------------------------------------------------
-- 4. users.structure_node_id  (which unit does this resident live in?)
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS structure_node_id UUID REFERENCES structure_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_structure_node
    ON users(structure_node_id)
    WHERE structure_node_id IS NOT NULL;

COMMIT;
