-- Role dinamis: enum user_role tidak bisa menampung role baru tanpa
-- ALTER TYPE + deploy. Diubah jadi TEXT supaya admin bisa menambah role
-- lewat halaman Manajemen Akses (RBAC) tanpa menyentuh skema DB.
-- Constraint UNIQUE lama melekat pada tipe enum; buang dulu supaya cast
-- kolom role tidak menimpa index (dan ON CONFLICT di seed lama tetap jalan).
ALTER TABLE role_module_permissions DROP CONSTRAINT IF EXISTS role_module_permissions_role_module_id_key;

ALTER TABLE users ALTER COLUMN role TYPE TEXT USING role::text;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'pelapor';

ALTER TABLE role_module_permissions ALTER COLUMN role TYPE TEXT USING role::text;
ALTER TABLE role_module_permissions ADD CONSTRAINT role_module_permissions_role_module_id_key UNIQUE (role, module_id);

-- Rename role lama -> nama baru (kode sistem ikut berubah, bukan label UI).
UPDATE users SET role = 'pelapor'   WHERE role = 'user';
UPDATE users SET role = 'it_support' WHERE role = 'staff_it';
UPDATE role_module_permissions SET role = 'pelapor'    WHERE role = 'user';
UPDATE role_module_permissions SET role = 'it_support' WHERE role = 'staff_it';

-- dashboard_configs.allowed_roles bertipe TEXT[] — update elemen lama.
UPDATE dashboard_configs
SET allowed_roles = ARRAY(
    SELECT CASE WHEN x = 'user' THEN 'pelapor'
                WHEN x = 'staff_it' THEN 'it_support'
                ELSE x END
    FROM unnest(allowed_roles) AS x
)
WHERE allowed_roles && ARRAY['user', 'staff_it'];

-- Role bawaan. Admin bisa menambah role lain kapan saja lewat tabel
-- role_module_permissions (endpoint PUT /admin/permissions/roles).
INSERT INTO role_module_permissions (role, module_id, access_level)
SELECT r.role::text, m.id, r.access_level::access_level
FROM (VALUES
    ('pelapor',    'none'),
    ('it_support', 'view'),
    ('analyst',    'editor'),
    ('programmer', 'editor'),
    ('leader',     'editor'),
    ('admin',      'editor')
) AS r(role, access_level)
CROSS JOIN modules m
WHERE NOT EXISTS (
    SELECT 1 FROM role_module_permissions p
    WHERE p.role = r.role AND p.module_id = m.id
);

-- Role baru butuh hak akses modul lain juga — beri view ke semua role baru
-- pada modul selain ticketing, mengikuti pola seed 000014.
INSERT INTO role_module_permissions (role, module_id, access_level)
SELECT r.role, m.id, 'view'::access_level
FROM (VALUES ('analyst'), ('programmer'), ('devops')) AS r(role)
CROSS JOIN modules m
WHERE m.code <> 'ticketing'
  AND NOT EXISTS (
    SELECT 1 FROM role_module_permissions p
    WHERE p.role = r.role AND p.module_id = m.id
  );

-- IT support mewarisi hak lama staff_it pada modul monitoring.
INSERT INTO role_module_permissions (role, module_id, access_level)
SELECT 'it_support', m.id, 'view'::access_level
FROM modules m
WHERE m.code = 'monitoring'
  AND NOT EXISTS (
    SELECT 1 FROM role_module_permissions p
    WHERE p.role = 'it_support' AND p.module_id = m.id
  );

-- Ticketing: it_support/leader/admin/programmer/devops dapat editor;
-- pelapor dapat view (bisa buat & lihat tiketnya, tidak edit detail).
INSERT INTO role_module_permissions (role, module_id, access_level)
SELECT r.role, m.id, r.access_level::access_level
FROM (VALUES
    ('it_support', 'editor'),
    ('leader', 'editor'),
    ('admin', 'editor'),
    ('programmer', 'editor'),
    ('devops', 'editor'),
    ('pelapor', 'view')
) AS r(role, access_level)
CROSS JOIN modules m
WHERE m.code = 'ticketing'
ON CONFLICT (role, module_id) DO UPDATE SET access_level = EXCLUDED.access_level;

-- Dashboard monitoring: izinkan role teknis melihat.
UPDATE dashboard_configs
SET allowed_roles = ARRAY['it_support', 'analyst', 'programmer', 'leader', 'admin', 'devops']
WHERE dashboard_name = 'monitoring';
