-- Cart: one active checkout basket per user (replaced on new selection)
CREATE TABLE IF NOT EXISTS cart (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    event_id    UUID        NOT NULL REFERENCES event(id)  ON DELETE CASCADE,
    event_title TEXT        NOT NULL,
    event_venue TEXT        NOT NULL,
    event_start TIMESTAMPTZ NOT NULL,
    currency    VARCHAR(10) NOT NULL DEFAULT 'INR',
    tickets     JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cart_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_user_id  ON cart (user_id);
CREATE INDEX IF NOT EXISTS idx_cart_event_id ON cart (event_id);
