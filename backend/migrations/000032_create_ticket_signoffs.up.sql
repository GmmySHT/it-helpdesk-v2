-- Bukti serah-terima (BAST) tiket: dokumen hasil cetak tiket yang sudah
-- ditandatangani pelapor, lalu di-scan dan diunggah kembali sebagai bukti
-- bahwa pelapor menyatakan pekerjaan sudah sesuai dan tiket boleh ditutup.
--
-- Satu tiket boleh punya lebih dari satu dokumen (mis. scan ulang / koreksi);
-- dokumen terbaru (created_at paling baru) dianggap yang berlaku.
CREATE TABLE IF NOT EXISTS ticket_signoffs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

    file_url        TEXT NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_type       VARCHAR(50) NOT NULL DEFAULT 'image',
    file_size       BIGINT NOT NULL DEFAULT 0,

    -- Nama yang tertulis di kolom tanda tangan pelapor pada dokumen.
    signed_by_name  VARCHAR(150) NOT NULL,
    -- Tanggal tanda tangan (boleh beda dari tanggal upload).
    signed_at       DATE,
    note            TEXT,

    uploaded_by     UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_signoffs_ticket
    ON ticket_signoffs (ticket_id, created_at DESC);
