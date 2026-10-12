CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE sla_rules (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id            UUID NOT NULL REFERENCES categories(id),
    priority               ticket_priority NOT NULL,
    response_time_minutes  INTEGER NOT NULL,
    resolution_time_minutes INTEGER NOT NULL
);

CREATE INDEX idx_sla_rules_category ON sla_rules (category_id);
