DROP INDEX IF EXISTS idx_ticket_signoffs_proposal_status;
ALTER TABLE ticket_signoffs
    DROP CONSTRAINT IF EXISTS ticket_signoffs_status_check,
    DROP COLUMN IF EXISTS approved_at,
    DROP COLUMN IF EXISTS approver_id,
    DROP COLUMN IF EXISTS version,
    DROP COLUMN IF EXISTS status;
