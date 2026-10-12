CREATE TYPE ticket_status AS ENUM (
    'unassigned',
    'assigned',
    'claimed',
    'resolved',
    'closed'
);

CREATE TYPE claim_type AS ENUM ('assigned', 'self_claimed');

CREATE TABLE tickets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            VARCHAR(200) NOT NULL,
    description      TEXT NOT NULL,
    category_id      UUID NOT NULL REFERENCES categories(id),
    priority         ticket_priority NOT NULL DEFAULT 'medium',
    status           ticket_status NOT NULL DEFAULT 'unassigned',

    created_by       UUID NOT NULL REFERENCES users(id),

    assigned_to      UUID REFERENCES users(id),
    assigned_by      UUID REFERENCES users(id),
    assigned_at      TIMESTAMPTZ,

    claimed_by       UUID REFERENCES users(id),
    claimed_at       TIMESTAMPTZ,          -- acuan awal siklus SLA
    claim_type       claim_type,

    sla_deadline     TIMESTAMPTZ,          -- dihitung ulang tiap siklus (claim/reassign/reopen)
    last_resolved_at TIMESTAMPTZ,
    reopen_count     INTEGER NOT NULL DEFAULT 0,

    closed_by        UUID REFERENCES users(id),
    closed_at        TIMESTAMPTZ,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_status ON tickets (status);
CREATE INDEX idx_tickets_assigned_to ON tickets (assigned_to);
CREATE INDEX idx_tickets_claimed_by ON tickets (claimed_by);
CREATE INDEX idx_tickets_created_by ON tickets (created_by);
