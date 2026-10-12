-- Kolom username OPSIONAL (nullable) — supaya user lama yang belum
-- punya username tetap bisa login pakai email seperti biasa. Constraint
-- UNIQUE tetap berlaku hanya untuk baris yang username-nya TERISI
-- (di PostgreSQL, banyak baris NULL tidak dianggap bentrok satu sama lain).
ALTER TABLE users ADD COLUMN username VARCHAR(50) UNIQUE;
