-- Metadata persetujuan proposal pada tabel ticket_signoffs yang sudah ada.
-- doc_type bertipe VARCHAR(20), jadi nilai 'proposal' tidak butuh ALTER TYPE.
-- Baris analysis/bast lama tetap terbaca (status default 'diajukan',
-- approver_id NULL — tidak dipakai query lama).

ALTER TABLE ticket_signoffs
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'diajukan',
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ticket_signoffs_status_check'
    ) THEN
        ALTER TABLE ticket_signoffs ADD CONSTRAINT ticket_signoffs_status_check
            CHECK (status IN ('diajukan', 'disetujui', 'ditolak'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ticket_signoffs_proposal_status
    ON ticket_signoffs (ticket_id, status)
    WHERE doc_type = 'proposal';
