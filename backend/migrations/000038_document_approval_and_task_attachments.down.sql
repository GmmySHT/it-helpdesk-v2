DROP TABLE IF EXISTS daily_task_attachments;
ALTER TABLE tickets DROP COLUMN IF EXISTS analysis_approval_required;
ALTER TABLE categories DROP COLUMN IF EXISTS requires_analysis_approval;
ALTER TABLE tickets DROP COLUMN IF EXISTS analysis_notes;
DROP FUNCTION IF EXISTS next_document_number(TEXT);
DROP TABLE IF EXISTS document_number_counters;
DROP INDEX IF EXISTS idx_ticket_signoffs_type;
ALTER TABLE ticket_signoffs DROP COLUMN IF EXISTS doc_number;
ALTER TABLE ticket_signoffs DROP COLUMN IF EXISTS doc_type;
