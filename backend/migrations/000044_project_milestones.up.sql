-- Milestone project + soft delete untuk tugas. Tabel daily_tasks TIDAK
-- disentuh: KPI harian tetap bersih dari pekerjaan project.
-- project_tasks sudah ada sejak 000042 — kolom milestone_id & deleted_at
-- ditambahkan tanpa backfill. Task lama tetap tampil sebagai "Tanpa milestone".

CREATE TABLE IF NOT EXISTS project_milestones (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    title        VARCHAR(200) NOT NULL,
    description  TEXT,
    start_date   DATE,
    due_date     DATE,
    status       TEXT NOT NULL DEFAULT 'belum_mulai',
    weight       INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    created_by   UUID NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);

ALTER TABLE project_milestones DROP CONSTRAINT IF EXISTS project_milestones_status_check;
ALTER TABLE project_milestones ADD CONSTRAINT project_milestones_status_check
    CHECK (status IN ('belum_mulai', 'berjalan', 'selesai'));
ALTER TABLE project_milestones DROP CONSTRAINT IF EXISTS project_milestones_weight_check;
ALTER TABLE project_milestones ADD CONSTRAINT project_milestones_weight_check
    CHECK (weight > 0);

ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES project_milestones(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_project_milestones_ticket
    ON project_milestones (ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_milestone
    ON project_tasks (milestone_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee_status
    ON project_tasks (assignee_id, status) WHERE deleted_at IS NULL;
