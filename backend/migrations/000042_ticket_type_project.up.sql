-- Tiket tipe "project": dikerjakan lebih dari satu orang, satu PIC,
-- berbasis proposal yang disetujui. Tiket regular (default) tidak berubah.
--
-- Enum ticket_status SENGAJA tidak disentuh — project memakai project_status
-- terpisah, sehingga query lama yang bergantung pada status tidak berubah.

ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'regular',
    ADD COLUMN IF NOT EXISTS project_status TEXT,
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS target_date DATE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tickets_ticket_type_check'
    ) THEN
        ALTER TABLE tickets ADD CONSTRAINT tickets_ticket_type_check
            CHECK (ticket_type IN ('regular', 'project'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tickets_project_status_check'
    ) THEN
        ALTER TABLE tickets ADD CONSTRAINT tickets_project_status_check
            CHECK (project_status IS NULL OR project_status IN (
                'draft', 'menunggu_persetujuan', 'berjalan', 'ditahan',
                'selesai', 'ditutup', 'dibatalkan'
            ));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets (ticket_type);
CREATE INDEX IF NOT EXISTS idx_tickets_project_status ON tickets (project_status)
    WHERE ticket_type = 'project';

-- Anggota tim project. PIC aktif maksimal satu per tiket (unique parsial).
CREATE TABLE IF NOT EXISTS ticket_members (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id  UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    role       TEXT NOT NULL DEFAULT 'member',
    added_by   UUID REFERENCES users(id),
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at TIMESTAMPTZ,
    UNIQUE (ticket_id, user_id)
);

ALTER TABLE ticket_members DROP CONSTRAINT IF EXISTS ticket_members_role_check;
ALTER TABLE ticket_members ADD CONSTRAINT ticket_members_role_check
    CHECK (role IN ('pic', 'member'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_members_active_pic
    ON ticket_members (ticket_id)
    WHERE role = 'pic' AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_members_ticket
    ON ticket_members (ticket_id) WHERE removed_at IS NULL;

-- Tugas di dalam project. Bukan tiket anak — tidak punya kode tiket, SLA,
-- atau rating. Progres dihitung dari bobot yang statusnya 'done'.
CREATE TABLE IF NOT EXISTS project_tasks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    title        VARCHAR(200) NOT NULL,
    description  TEXT,
    assignee_id  UUID REFERENCES users(id),
    due_date     DATE,
    status       TEXT NOT NULL DEFAULT 'todo',
    weight       INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    created_by   UUID NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_status_check;
ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_status_check
    CHECK (status IN ('todo', 'doing', 'done'));
ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_weight_check;
ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_weight_check
    CHECK (weight > 0);

CREATE INDEX IF NOT EXISTS idx_project_tasks_ticket
    ON project_tasks (ticket_id, sort_order);

-- Modul RBAC "project" — tampil di Manajemen Akses & /me/permissions.
INSERT INTO modules (code, name, description, is_active)
VALUES ('project', 'Project', 'Tiket proyek dengan proposal, tim, dan tugas', true)
ON CONFLICT (code) DO UPDATE SET is_active = true, name = EXCLUDED.name;

INSERT INTO role_module_permissions (role, module_id, access_level)
SELECT r.role, m.id, r.access_level::access_level
FROM (VALUES
    ('pelapor',    'none'),
    ('it_support', 'editor'),
    ('analyst',    'editor'),
    ('programmer', 'editor'),
    ('leader',     'editor'),
    ('admin',      'editor')
) AS r(role, access_level)
CROSS JOIN modules m
WHERE m.code = 'project'
  AND NOT EXISTS (
      SELECT 1 FROM role_module_permissions p
      WHERE p.module_id = m.id AND p.role = r.role
  );
