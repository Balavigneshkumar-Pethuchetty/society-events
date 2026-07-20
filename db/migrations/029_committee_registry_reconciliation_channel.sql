-- Links each event's committee_registry row to the channel this repo transparently
-- provisions in the sibling payment_reconcilation_service (~/payment_reconcilation_service)
-- so its AI-vision screenshot verification (verifyPaymentScreenshot) searches that event's
-- own organizer-configured inbox (imap_host/user/password/mailbox, added in migration 028)
-- instead of a single shared channel picked by "whichever one is_active".
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/029_committee_registry_reconciliation_channel.sql

ALTER TABLE committee_registry
    ADD COLUMN IF NOT EXISTS reconciliation_channel_id UUID;
