CREATE TABLE ticket_reassignment_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id         UUID NOT NULL REFERENCES tickets(id),
    previous_staff_id UUID NOT NULL REFERENCES users(id),
    new_staff_id      UUID NOT NULL REFERENCES users(id),
    reassigned_by     UUID NOT NULL REFERENCES users(id),  -- leader yang klik reassign paksa
    reason            TEXT NOT NULL,
    sla_reset_at      TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_reassignment_logs_ticket ON ticket_reassignment_logs (ticket_id);
