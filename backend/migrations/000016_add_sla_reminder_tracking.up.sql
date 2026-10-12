-- Dua kolom ini mencatat KAPAN terakhir kali reminder dikirim, supaya
-- background job tidak mengirim notifikasi berulang-ulang tiap kali dia
-- jalan (misalnya tiap 5 menit) untuk tiket yang sama. NULL berarti belum
-- pernah dikirim untuk siklus deadline saat ini.
ALTER TABLE tickets ADD COLUMN sla_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN sla_overdue_notified_at TIMESTAMPTZ;
