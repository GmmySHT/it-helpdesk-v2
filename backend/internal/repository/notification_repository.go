package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

type NotificationRepository struct {
	db *pgxpool.Pool
}

func NewNotificationRepository(db *pgxpool.Pool) *NotificationRepository {
	return &NotificationRepository{db: db}
}

func (r *NotificationRepository) Create(ctx context.Context, n *model.Notification) error {
	query := `
		INSERT INTO notifications (ticket_id, recipient_id, type, title, message, channel)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, is_read, sent_at
	`
	return r.db.QueryRow(ctx, query, n.TicketID, n.RecipientID, n.Type, n.Title, n.Message, n.Channel).
		Scan(&n.ID, &n.IsRead, &n.SentAt)
}

// ListByRecipient mengambil notifikasi milik satu user, terbaru duluan.
// Dibatasi 50 supaya tidak menarik seluruh riwayat setiap kali dropdown dibuka.
func (r *NotificationRepository) ListByRecipient(ctx context.Context, recipientID string) ([]model.Notification, error) {
	query := `
		SELECT id, ticket_id, recipient_id, type, title, message, channel, is_read, sent_at, read_at
		FROM notifications
		WHERE recipient_id = $1
		ORDER BY sent_at DESC
		LIMIT 50
	`
	rows, err := r.db.Query(ctx, query, recipientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.Notification
	for rows.Next() {
		var n model.Notification
		if err := rows.Scan(
			&n.ID, &n.TicketID, &n.RecipientID, &n.Type, &n.Title, &n.Message,
			&n.Channel, &n.IsRead, &n.SentAt, &n.ReadAt,
		); err != nil {
			return nil, err
		}
		list = append(list, n)
	}
	return list, rows.Err()
}

func (r *NotificationRepository) MarkRead(ctx context.Context, id, recipientID string) error {
	// WHERE recipient_id juga dicek, supaya satu user tidak bisa menandai
	// notifikasi milik user lain sebagai "sudah dibaca".
	_, err := r.db.Exec(ctx, `
		UPDATE notifications SET is_read = true, read_at = now()
		WHERE id = $1 AND recipient_id = $2
	`, id, recipientID)
	return err
}

func (r *NotificationRepository) CountUnread(ctx context.Context, recipientID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM notifications WHERE recipient_id = $1 AND is_read = false
	`, recipientID).Scan(&count)
	return count, err
}
