DROP INDEX IF EXISTS idx_users_not_deleted;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE users DROP COLUMN IF EXISTS is_active;
