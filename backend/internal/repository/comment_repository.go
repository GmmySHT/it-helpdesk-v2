package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

type CommentRepository struct {
	db *pgxpool.Pool
}

func NewCommentRepository(db *pgxpool.Pool) *CommentRepository {
	return &CommentRepository{db: db}
}

func (r *CommentRepository) Create(ctx context.Context, c *model.TicketComment) error {
	query := `
		INSERT INTO ticket_comments (ticket_id, user_id, comment_type, message)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`
	return r.db.QueryRow(ctx, query, c.TicketID, c.UserID, c.CommentType, c.Message).
		Scan(&c.ID, &c.CreatedAt)
}

func (r *CommentRepository) CreateAttachment(ctx context.Context, a *model.CommentAttachment) error {
	query := `
		INSERT INTO comment_attachments (comment_id, file_url, file_type)
		VALUES ($1, $2, $3)
		RETURNING id, uploaded_at
	`
	return r.db.QueryRow(ctx, query, a.CommentID, a.FileURL, a.FileType).
		Scan(&a.ID, &a.UploadedAt)
}

// ListByTicket mengambil semua komentar sebuah tiket beserta lampirannya,
// diurutkan dari yang terlama — dipakai untuk menampilkan riwayat
// percakapan/resolve di halaman detail tiket.
//
// Dilakukan 2 query terpisah (komentar dulu, baru lampiran) alih-alih JOIN
// besar, supaya struktur "1 komentar bisa punya banyak lampiran" tidak bikin
// baris komentar terduplikasi di hasil query.
func (r *CommentRepository) ListByTicket(ctx context.Context, ticketID string) ([]model.TicketComment, error) {
	query := `
		SELECT tc.id, tc.ticket_id, tc.user_id, u.name, tc.comment_type, tc.message, tc.created_at
		FROM ticket_comments tc
		JOIN users u ON u.id = tc.user_id
		WHERE tc.ticket_id = $1
		ORDER BY tc.created_at ASC
	`
	rows, err := r.db.Query(ctx, query, ticketID)
	if err != nil {
		return nil, err
	}

	var comments []model.TicketComment
	for rows.Next() {
		var c model.TicketComment
		if err := rows.Scan(&c.ID, &c.TicketID, &c.UserID, &c.UserName, &c.CommentType, &c.Message, &c.CreatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		comments = append(comments, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Ambil lampiran untuk semua komentar sekaligus, lalu kelompokkan per
	// comment_id di Go — lebih efisien daripada query terpisah per komentar
	// (menghindari masalah N+1 query).
	if len(comments) == 0 {
		return comments, nil
	}
	commentIDs := make([]string, len(comments))
	for i, c := range comments {
		commentIDs[i] = c.ID
	}

	attRows, err := r.db.Query(ctx, `
		SELECT id, comment_id, file_url, COALESCE(file_type, ''), uploaded_at
		FROM comment_attachments
		WHERE comment_id = ANY($1)
	`, commentIDs)
	if err != nil {
		return nil, err
	}
	defer attRows.Close()

	attachmentsByComment := map[string][]model.CommentAttachment{}
	for attRows.Next() {
		var a model.CommentAttachment
		if err := attRows.Scan(&a.ID, &a.CommentID, &a.FileURL, &a.FileType, &a.UploadedAt); err != nil {
			return nil, err
		}
		attachmentsByComment[a.CommentID] = append(attachmentsByComment[a.CommentID], a)
	}

	for i := range comments {
		comments[i].Attachments = attachmentsByComment[comments[i].ID]
	}

	return comments, attRows.Err()
}
