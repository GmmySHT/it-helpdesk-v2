CREATE TABLE ticket_reopen_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id      UUID NOT NULL REFERENCES tickets(id),
    reopened_by    UUID NOT NULL REFERENCES users(id),  -- leader yang klik reopen
    staff_id       UUID NOT NULL REFERENCES users(id),  -- staf yang akan mengerjakan ulang
    reopen_reason  TEXT NOT NULL,
    reopen_number  INTEGER NOT NULL,                    -- ke berapa kali tiket ini dibuka ulang
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_reopen_logs_ticket ON ticket_reopen_logs (ticket_id);
