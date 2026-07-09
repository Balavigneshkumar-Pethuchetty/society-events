-- Lets the centralized reconciliation flow persist a screenshot + submitted review
-- data at submission time (not just on eventual SSE confirmation), so organizers have
-- something to review in ReconciliationConsole even if reconciliation never confirms.
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/015_payment_screenshot.sql

ALTER TABLE payment_transaction ADD COLUMN IF NOT EXISTS screenshot_path VARCHAR(255);
ALTER TABLE payment_transaction ADD COLUMN IF NOT EXISTS reconciliation_txn_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_pt_reconciliation_txn ON payment_transaction(reconciliation_txn_id);
