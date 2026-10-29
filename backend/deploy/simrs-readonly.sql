-- Jalankan oleh DBA di server database SIMRS (sebagai superuser), TERHUBUNG ke
-- database SIMRS yang dipakai modul Monitoring.
--
-- Tujuan: aplikasi helpdesk hanya boleh MEMBACA SIMRS. Dengan akun khusus ini,
-- kesalahan kode atau kebocoran kredensial tidak bisa mengubah data pasien.
-- Buat akun BARU (jangan memakai ulang akun lain yang punya hak tulis).

CREATE ROLE ticketing_ro LOGIN PASSWORD 'GANTI_PASSWORD_KUAT';

GRANT CONNECT ON DATABASE nama_database_simrs TO ticketing_ro;   -- sesuaikan nama database
GRANT USAGE ON SCHEMA public TO ticketing_ro;                    -- sesuaikan bila ada schema lain
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ticketing_ro;

-- Sesi akun ini otomatis read-only walaupun ada perintah tulis yang lolos
ALTER ROLE ticketing_ro SET default_transaction_read_only = on;

-- Pembatasan waktu agar query berat tidak membebani SIMRS
ALTER ROLE ticketing_ro SET statement_timeout = '30s';

-- Verifikasi (hasil harus: SELECT = true, INSERT = false)
-- SELECT has_table_privilege('ticketing_ro', 'public.pendaftaran_t', 'SELECT') AS bisa_select,
--        has_table_privilege('ticketing_ro', 'public.pendaftaran_t', 'INSERT') AS bisa_insert;
