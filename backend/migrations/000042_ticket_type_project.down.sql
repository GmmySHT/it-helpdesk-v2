-- Rollback Tahap 1 project. Meja data project dihapus; tiket regular
-- tidak tersentuh (kolom project dibuang, bukan mengubah status tiket).

INSERT INTO role_module_permissions (role, module_id, access_level)
SELECT p.role, m.id, 'view'::access_level
FROM modules m
CROSS JOIN (VALUES
    ('pelapor'), ('it_support'), ('analyst'), ('programmer'),
    ('leader'), ('admin')
) AS p(role)
WHERE m.code = 'ticketing'
  AND NOT EXISTS (
      SELECT 1 FROM role_module_permissions x
      WHERE x.module_id = m.id AND x.role = p.role
  );

DELETE FROM role_module_permissions
WHERE module_id IN (SELECT id FROM modules WHERE code = 'project');
DELETE FROM modules WHERE code = 'project';

DROP TABLE IF EXISTS project_tasks;
DROP TABLE IF EXISTS ticket_members;

DROP INDEX IF EXISTS idx_tickets_project_status;
DROP INDEX IF EXISTS idx_tickets_type;

ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_project_status_check,
    DROP CONSTRAINT IF EXISTS tickets_ticket_type_check,
    DROP COLUMN IF EXISTS target_date,
    DROP COLUMN IF EXISTS start_date,
    DROP COLUMN IF EXISTS project_status,
    DROP COLUMN IF EXISTS ticket_type;
