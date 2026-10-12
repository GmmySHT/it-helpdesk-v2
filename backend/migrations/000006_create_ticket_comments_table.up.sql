CREATE TYPE comment_type AS ENUM ('resolve_note', 'reopen_note', 'general_comment');

CREATE TABLE ticket_comments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID NOT NULL REFERENCES tickets(id),
    user_id      UUID NOT NULL REFERENCES users(id),
    comment_type comment_type NOT NULL,
    message      TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_comments_ticket ON ticket_comments (ticket_id);
