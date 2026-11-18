-- FITUR 1 — Dokumen tiket yang bisa dicetak & ditandatangani
--
-- Dua jenis dokumen kertas dipakai di tiket:
--   'analysis' = persetujuan analisa/catatan staf IT, WAJIB disetujui pelapor
--                (scan bertanda tangan) SEBELUM tiket boleh masuk status claimed.
--   'bast'     = berita acara serah terima saat tiket selesai (tidak ada gate).
--
-- Tabel ticket_signoffs yang sudah ada dipakai ulang untuk keduanya, cukup
-- tambah doc_type + doc_number. Baris lama otomatis jadi 'bast' sehingga
-- dokumen BAST lama tetap terbaca tanpa data migration yang merusak.

ALTER TABLE ticket_signoffs ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20) NOT NULL DEFAULT 'bast';
ALTER TABLE ticket_signoffs ADD COLUMN IF NOT EXISTS doc_number VARCHAR(40);

-- Backfill nomor dokumen lama supaya arsip tetap punya penanda. Baris baru
-- selalu memakai nomor dari next_document_number() (unik per tahun).
UPDATE ticket_signoffs
SET doc_number = 'BAST-' || to_char(created_at, 'YYYY') || '-' || upper(substring(id::text from 1 for 8))
WHERE doc_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_signoffs_type
    ON ticket_signoffs (ticket_id, doc_type, created_at DESC);

-- Nomor dokumen unik: PA-2026-0001, BAST-2026-0001, dll.
CREATE TABLE IF NOT EXISTS document_number_counters (
    prefix      VARCHAR(10) NOT NULL,
    year_part   VARCHAR(4)  NOT NULL,
    last_number INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, year_part)
);

CREATE OR REPLACE FUNCTION next_document_number(p_prefix TEXT)
RETURNS TEXT AS $$
DECLARE
    v_year TEXT := to_char(now(), 'YYYY');
    v_seq  INTEGER;
BEGIN
    INSERT INTO document_number_counters (prefix, year_part, last_number)
    VALUES (p_prefix, v_year, 1)
    ON CONFLICT (prefix, year_part)
    DO UPDATE SET last_number = document_number_counters.last_number + 1
    RETURNING last_number INTO v_seq;
    RETURN p_prefix || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Analisa/catatan staf IT: diisi sebelum dokumen persetujuan dicetak.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS analysis_notes TEXT;

-- Gate persetujuan analisa.
--   categories.requires_analysis_approval = default untuk semua tiket kategori itu
--   tickets.analysis_approval_required    = override per tiket (NULL = ikut kategori)
-- Gate aktif bila COALESCE(t.analysis_approval_required, c.requires_analysis_approval).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS requires_analysis_approval BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS analysis_approval_required BOOLEAN;


-- FITUR 2 — Lampiran opsional Daily Task (0..5 file per task).
CREATE TABLE IF NOT EXISTS daily_task_attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id      UUID NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
    file_url     TEXT NOT NULL,
    file_name    VARCHAR(255) NOT NULL,
    file_type    VARCHAR(20)  NOT NULL,   -- "image" atau "pdf"
    file_size    BIGINT       NOT NULL DEFAULT 0,
    uploaded_by  UUID NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_task_attachments_task
    ON daily_task_attachments (task_id, created_at DESC);
