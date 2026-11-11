ALTER TABLE tickets
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS deleted_by,
  DROP COLUMN IF EXISTS deleted_reason;
