-- Jejak perubahan kata sandi.
--
-- password_changed_at dipakai untuk MEMBATALKAN token JWT lama: token
-- menyimpan waktu perubahan password saat diterbitkan (claim pwd_at), lalu
-- middleware menolak token yang lebih tua dari nilai kolom ini. Tanpa ini,
-- reset password oleh admin tidak akan menendang sesi penyerang yang sudah
-- login (JWT stateless, berlaku 24 jam).
--
-- must_change_password dipakai saat admin/leader mereset password akun lain:
-- pemilik akun wajib mengganti kata sandi hasil reset sebelum memakai
-- aplikasi seperti biasa.
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
