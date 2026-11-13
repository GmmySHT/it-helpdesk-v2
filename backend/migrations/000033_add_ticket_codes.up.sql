-- Kode tiket ber-prefix per kategori: SIMRS-00019, NTWRK-00029.
--
-- Kenapa prefix disimpan di tabel categories: kode harus mengikuti kategori
-- tiket, dan kategori bisa ditambah admin kapan saja. Prefix disimpan sekali
-- (bukan diturunkan dari nama setiap kali) supaya kode tiket lama tidak
-- berubah kalau nama kategori diganti.

ALTER TABLE categories ADD COLUMN code VARCHAR(10);

-- Prefix untuk kategori bawaan. Kategori lain (kalau ada) dapat fallback
-- otomatis di bawah: 5 karakter pertama nama, huruf besar, tanpa simbol.
UPDATE categories SET code = 'SIMRS' WHERE upper(name) LIKE '%SIMRS%';
UPDATE categories SET code = 'NTWRK' WHERE upper(name) LIKE '%JARINGAN%' OR upper(name) LIKE '%NETWORK%';
UPDATE categories SET code = 'HW'    WHERE upper(name) LIKE '%HARDWARE%';
UPDATE categories SET code = 'SW'    WHERE upper(name) LIKE '%SOFTWARE%';
UPDATE categories SET code = 'ACC'   WHERE upper(name) LIKE '%AKUN%' OR upper(name) LIKE '%AKSES%';

UPDATE categories
SET code = upper(substring(regexp_replace(name, '[^A-Za-z0-9]', '', 'g') from 1 for 5))
WHERE code IS NULL OR code = '';

ALTER TABLE categories ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX idx_categories_code ON categories (code);

-- Penghitung nomor urut per prefix. Tabel terpisah (bukan MAX(ticket_code))
-- supaya nomor tidak pernah bentrok walau dua tiket dibuat bersamaan:
-- UPDATE ... RETURNING di satu baris bersifat atomik.
CREATE TABLE ticket_code_counters (
    prefix      VARCHAR(10) PRIMARY KEY,
    last_number INTEGER NOT NULL DEFAULT 0
);

-- Kolom kode di tiket. Nullable saat backfill, lalu diisi dan dijadikan unik.
ALTER TABLE tickets ADD COLUMN ticket_code VARCHAR(30);

-- Backfill tiket lama berurutan sesuai waktu dibuat, per kategori.
WITH numbered AS (
    SELECT t.id,
           c.code AS prefix,
           row_number() OVER (PARTITION BY c.code ORDER BY t.created_at, t.id) AS seq
    FROM tickets t
    JOIN categories c ON c.id = t.category_id
)
UPDATE tickets t
SET ticket_code = n.prefix || '-' || lpad(n.seq::text, 5, '0')
FROM numbered n
WHERE t.id = n.id;

-- Penghitung diisi dari nomor terakhir hasil backfill supaya tiket baru
-- melanjutkan urutan, bukan mulai dari 1 lagi.
INSERT INTO ticket_code_counters (prefix, last_number)
SELECT split_part(ticket_code, '-', 1), MAX(split_part(ticket_code, '-', 2)::int)
FROM tickets
WHERE ticket_code IS NOT NULL
GROUP BY split_part(ticket_code, '-', 1);

CREATE UNIQUE INDEX idx_tickets_ticket_code ON tickets (ticket_code);
