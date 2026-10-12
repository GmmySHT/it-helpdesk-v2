-- PostgreSQL tidak mendukung DROP VALUE untuk enum secara native.
-- Rollback status ini butuh recreate type + migrasi data, sengaja tidak
-- diimplementasikan otomatis karena berisiko tinggi kalau sudah ada data
-- dengan status 'pending_approval'. Kalau benar-benar perlu rollback,
-- lakukan manual dan hati-hati.
SELECT 1;
