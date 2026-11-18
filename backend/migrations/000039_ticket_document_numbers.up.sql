-- Nomor dokumen yang sudah "direservasi" saat halaman cetak dibuka, supaya
-- angka di kertas identik dengan nomor pada scan yang diunggah kembali.
CREATE TABLE IF NOT EXISTS ticket_document_numbers (
    ticket_id  UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    doc_type   VARCHAR(16) NOT NULL,
    year_part  VARCHAR(4) NOT NULL,
    doc_number TEXT NOT NULL,
    PRIMARY KEY (ticket_id, doc_type, year_part)
);

CREATE INDEX IF NOT EXISTS idx_ticket_document_numbers_number
    ON ticket_document_numbers (doc_number);
