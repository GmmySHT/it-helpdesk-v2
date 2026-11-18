-- Simpan siapa yang mengisi analisa, supaya dokumen cetak persetujuan
-- analisa bisa menampilkan nama analyst yang sebenarnya (bukan claimed_by,
-- karena yang menganalisa bisa berbeda dari yang mengerjakan nanti).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS analysis_by UUID REFERENCES users(id);
