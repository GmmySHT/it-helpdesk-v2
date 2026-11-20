-- Kendala Daily Task memakai kategori tiket yang sama (sumber tunggal),
-- supaya daftar Kendala selalu sinkron dengan kategori di form tiket.
-- unit_id tetap departemen (SIMRS, IGD, ...) — tidak diubah.

ALTER TABLE daily_tasks
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_tasks_category ON daily_tasks (category_id);
