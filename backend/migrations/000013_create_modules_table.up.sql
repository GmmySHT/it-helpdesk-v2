CREATE TABLE modules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO modules (code, name, description, is_active) VALUES
    ('ticketing', 'Ticketing', 'Kelola tiket IT dari dibuat sampai ditutup', true),
    ('asset', 'Asset', 'Inventaris perangkat & pelacakan aset IT', false),
    ('reports', 'Laporan & KPI', 'Ringkasan performa dan SLA tim', false),
    ('access_management', 'Manajemen Akses', 'Atur hak akses modul per role dan per user', true);
