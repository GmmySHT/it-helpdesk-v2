-- Isi nama pengunggah proposal lama yang kosong dari tabel users.
-- Hanya baris dengan signed_by_name NULL/kosong yang disentuh.
UPDATE ticket_signoffs s
SET signed_by_name = u.name
FROM users u
WHERE s.doc_type = 'proposal'
  AND (s.signed_by_name IS NULL OR s.signed_by_name = '')
  AND s.uploaded_by = u.id;
