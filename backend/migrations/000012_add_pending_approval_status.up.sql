-- ALTER TYPE ADD VALUE tidak bisa dipakai di statement yang sama dengan
-- transaksi yang langsung memakainya, tapi aman dijalankan sebagai migration
-- terpisah seperti ini (PostgreSQL 12+).
ALTER TYPE ticket_status ADD VALUE 'pending_approval' BEFORE 'unassigned';
