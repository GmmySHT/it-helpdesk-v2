CREATE TABLE comment_attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id  UUID NOT NULL REFERENCES ticket_comments(id),
    file_url    TEXT NOT NULL,
    file_type   VARCHAR(50),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comment_attachments_comment ON comment_attachments (comment_id);
