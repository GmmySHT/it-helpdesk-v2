DROP INDEX IF EXISTS idx_tickets_ticket_code;
ALTER TABLE tickets DROP COLUMN IF EXISTS ticket_code;
DROP TABLE IF EXISTS ticket_code_counters;
DROP INDEX IF EXISTS idx_categories_code;
ALTER TABLE categories DROP COLUMN IF EXISTS code;
