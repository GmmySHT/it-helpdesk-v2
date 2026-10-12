-- Modul Monitoring SIMRS: executive monitoring pendapatan + pasien real-time.
-- Sumber data: DB SIMRS (pgxpool terpisah), sementara memakai data simulasi.

-- 1. Daftarkan modul agar tampil & bisa diatur di halaman Manajemen Akses
INSERT INTO modules (code, name, description, is_active)
VALUES ('monitoring', 'Monitoring SIMRS', 'Executive monitoring pendapatan dan pasien real-time', true)
ON CONFLICT (code) DO UPDATE SET is_active = true;

-- 2. Izin default per role: admin editor, staff_it/leader view
INSERT INTO role_module_permissions (role, module_id, access_level)
SELECT r.role::user_role, m.id, r.access_level::access_level
FROM (VALUES
    ('admin',    'editor'),
    ('staff_it', 'view'),
    ('leader',   'view')
) AS r(role, access_level)
CROSS JOIN modules m
WHERE m.code = 'monitoring'
  AND NOT EXISTS (
    SELECT 1 FROM role_module_permissions p
    WHERE p.module_id = m.id AND p.role = r.role::user_role
  );

-- 3. Config default untuk dashboard monitoring
INSERT INTO dashboard_configs (dashboard_name, is_public, allowed_roles, refresh_interval_seconds)
VALUES ('monitoring', false, '{staff_it, leader, admin}', 30)
ON CONFLICT (dashboard_name) DO NOTHING;
