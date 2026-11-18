UPDATE users SET role = 'user'      WHERE role = 'pelapor';
UPDATE users SET role = 'staff_it'  WHERE role = 'it_support';
DELETE FROM role_module_permissions WHERE role IN ('analyst', 'programmer', 'devops');
UPDATE role_module_permissions SET role = 'user'      WHERE role = 'pelapor';
UPDATE role_module_permissions SET role = 'staff_it'  WHERE role = 'it_support';

UPDATE dashboard_configs
SET allowed_roles = ARRAY['staff_it', 'leader', 'admin']
WHERE dashboard_name = 'monitoring';

-- Hapus dulu constraint UNIQUE lama (role user_role, module_id) yang
-- dipakai ON CONFLICT di seed 000028; nanti dibuat ulang setelah cast.
ALTER TABLE role_module_permissions DROP CONSTRAINT IF EXISTS role_module_permissions_role_module_id_key;

ALTER TABLE role_module_permissions ALTER COLUMN role TYPE user_role USING role::user_role;
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';

ALTER TABLE role_module_permissions ADD CONSTRAINT role_module_permissions_role_module_id_key UNIQUE (role, module_id);
