-- Kolom is_active dipakai fitur "Nonaktifkan User": user nonaktif tidak
-- bisa login lagi, tapi datanya (dan seluruh riwayat tiket yang terkait)
-- tetap utuh. Default TRUE supaya semua user lama otomatis aktif.
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- deleted_at dipakai untuk SOFT DELETE. Tidak dibuat hard delete karena
-- tabel tickets punya kolom seperti created_by/assigned_to/closed_by yang
-- REFERENCES users(id) TANPA ON DELETE CASCADE — hard delete pada user
-- yang pernah bikin/pegang tiket akan gagal (foreign key violation) atau,
-- kalau dipaksa CASCADE, akan menghapus/merusak riwayat tiket. Soft delete
-- menyembunyikan user dari daftar & mencegahnya login, tanpa kehilangan
-- histori data yang sudah ada.
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- Index parsial: hanya mengindeks baris yang belum dihapus, dipakai oleh
-- query ListAll/FindByIdentifier yang selalu filter "deleted_at IS NULL".
CREATE INDEX idx_users_not_deleted ON users (id) WHERE deleted_at IS NULL;
