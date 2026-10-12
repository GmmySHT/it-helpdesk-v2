-- Hapus modul monitoring dari RBAC
DELETE FROM role_module_permissions p
USING modules m
WHERE p.module_id = m.id AND m.code = 'monitoring';

DELETE FROM modules WHERE code = 'monitoring';

-- Hapus config dashboard monitoring
DELETE FROM dashboard_configs WHERE dashboard_name = 'monitoring';