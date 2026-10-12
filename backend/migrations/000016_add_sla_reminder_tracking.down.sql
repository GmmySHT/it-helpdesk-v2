ALTER TABLE tickets DROP COLUMN IF EXISTS sla_reminder_sent_at;
ALTER TABLE tickets DROP COLUMN IF EXISTS sla_overdue_notified_at;
