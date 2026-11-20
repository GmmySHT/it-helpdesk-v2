DROP INDEX IF EXISTS idx_daily_tasks_category;
ALTER TABLE daily_tasks DROP COLUMN IF EXISTS category_id;
