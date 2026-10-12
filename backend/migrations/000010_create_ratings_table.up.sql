CREATE TABLE ratings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id  UUID NOT NULL UNIQUE REFERENCES tickets(id),  -- UNIQUE: 1 tiket cuma boleh dinilai sekali
    score      SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
