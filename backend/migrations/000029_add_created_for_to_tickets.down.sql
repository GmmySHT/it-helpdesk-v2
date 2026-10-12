-- Rollback: Remove created_for column from tickets
DROP INDEX IF EXISTS idx_tickets_created_for;
ALTER TABLE tickets DROP COLUMN IF EXISTS created_for;
