-- Migration: Add created_for column to tickets
-- Allows leader/admin to create tickets on behalf of a user
ALTER TABLE tickets ADD COLUMN created_for UUID NULL REFERENCES users(id);
CREATE INDEX idx_tickets_created_for ON tickets (created_for);
