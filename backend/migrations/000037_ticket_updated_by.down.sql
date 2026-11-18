DROP INDEX IF EXISTS idx_tickets_updated_by;
ALTER TABLE tickets DROP COLUMN IF EXISTS updated_at;
ALTER TABLE tickets DROP COLUMN IF EXISTS updated_by;
