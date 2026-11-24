-- CATATAN: menjalankan down migration ini menghilangkan tautan task ->
-- milestone (kolom milestone_id dihapus) dan marker soft-delete. Task lama
-- tidak dihapus fisik, tetapi riwayat penghapusan tidak lagi tersimpan.

DROP INDEX IF EXISTS idx_project_tasks_assignee_status;
DROP INDEX IF EXISTS idx_project_tasks_milestone;
DROP INDEX IF EXISTS idx_project_milestones_ticket;

ALTER TABLE project_tasks
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS milestone_id;

DROP TABLE IF EXISTS project_milestones;
