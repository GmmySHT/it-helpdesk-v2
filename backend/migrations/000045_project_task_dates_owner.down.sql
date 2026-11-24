-- Down untuk 000045: hapus kolom tambahan. Data tanggal & owner akan hilang.

DROP INDEX IF EXISTS idx_project_tasks_due_reminder;

ALTER TABLE project_milestones
    DROP COLUMN IF EXISTS owner_id;

ALTER TABLE project_tasks
    DROP COLUMN IF EXISTS due_reminder_sent_at,
    DROP COLUMN IF EXISTS start_date;
