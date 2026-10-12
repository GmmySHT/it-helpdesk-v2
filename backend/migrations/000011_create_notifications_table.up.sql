CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'whatsapp', 'push');

CREATE TABLE notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID REFERENCES tickets(id),   -- nullable: notifikasi umum tidak selalu terkait 1 tiket
    recipient_id UUID NOT NULL REFERENCES users(id),
    type         VARCHAR(50) NOT NULL,           -- contoh: 'ticket_claimed', 'ticket_assigned', 'ticket_resolved'
    title        VARCHAR(200) NOT NULL,
    message      TEXT NOT NULL,
    channel      notification_channel NOT NULL DEFAULT 'in_app',
    is_read      BOOLEAN NOT NULL DEFAULT false,
    sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at      TIMESTAMPTZ
);

CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, is_read);
