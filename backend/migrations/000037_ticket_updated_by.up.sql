-- Catatan siapa yang terakhir mengoreksi detail tiket (judul/deskripsi/
-- kategori/prioritas). Dipakah laporan KPI untuk menunjukkan "Dibuat Oleh"
-- dan "Diedit Oleh" supaya kontribusi analyst/leader/support/programmer
-- yang membuat ATAU mengedit tiket tidak hilang dari laporan.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tickets_updated_by ON tickets (updated_by);
