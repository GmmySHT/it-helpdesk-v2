-- Riwayat perubahan project (tanggal dll). Tabel khusus project,
-- tidak menyentuh tabel histori tiket regular maupun daily_tasks.

CREATE TABLE IF NOT EXISTS project_histories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_histories_ticket
    ON project_histories (ticket_id, created_at DESC);
