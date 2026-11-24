-- Project task/milestone tambahan untuk penanggung jawab & tanggal.
-- HANYA menambah kolom yang belum ada, semua NULLABLE, tanpa backfill.
-- daily_tasks TIDAK disentuh.

ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS due_reminder_sent_at TIMESTAMPTZ;

ALTER TABLE project_milestones
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_tasks_due_reminder
    ON project_tasks (due_date) WHERE deleted_at IS NULL AND status <> 'done';
