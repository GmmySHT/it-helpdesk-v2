-- Soft delete untuk tiket: admin bisa hapus tiket tapi riwayat tetap tersimpan
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_deleted_at ON tickets (deleted_at);
