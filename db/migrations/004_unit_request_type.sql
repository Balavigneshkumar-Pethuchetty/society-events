-- Add type column to distinguish add vs remove requests
ALTER TABLE unit_assignment_requests
  ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'add';

ALTER TABLE unit_assignment_requests
  DROP CONSTRAINT IF EXISTS unit_assignment_requests_type_check;

ALTER TABLE unit_assignment_requests
  ADD CONSTRAINT unit_assignment_requests_type_check
  CHECK (type IN ('add', 'remove'));
