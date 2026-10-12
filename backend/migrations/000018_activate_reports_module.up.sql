-- Modul "reports" sekarang benar-benar dibangun, jadi diaktifkan.
-- Kalau admin sudah sempat mengubah status ini manual lewat halaman
-- Manajemen Akses, UPDATE ini tetap aman (idempotent, tidak menimpa
-- pilihan admin dengan nilai yang berbeda... tapi karena ini migration
-- satu arah, di sini kita PAKSA true sesuai maksud rilis fitur ini).
UPDATE modules SET is_active = true WHERE code = 'reports';
