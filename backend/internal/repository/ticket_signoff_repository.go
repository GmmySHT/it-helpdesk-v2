package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

var ErrSignoffNotFound = errors.New("dokumen serah-terima tidak ditemukan")

type TicketSignoffRepository struct {
	db *pgxpool.Pool
}

func NewTicketSignoffRepository(db *pgxpool.Pool) *TicketSignoffRepository {
	return &TicketSignoffRepository{db: db}
}

const signoffSelect = `
	SELECT s.id, s.ticket_id, s.file_url, s.file_name, s.file_type, s.file_size,
		s.signed_by_name, s.signed_at, s.note,
		s.uploaded_by, u.name, s.created_at
	FROM ticket_signoffs s
	LEFT JOIN users u ON u.id = s.uploaded_by
`

func scanSignoff(row pgx.Row) (*model.TicketSignoff, error) {
	var s model.TicketSignoff
	err := row.Scan(
		&s.ID, &s.TicketID, &s.FileURL, &s.FileName, &s.FileType, &s.FileSize,
		&s.SignedByName, &s.SignedAt, &s.Note,
		&s.UploadedBy, &s.UploadedByName, &s.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSignoffNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (r *TicketSignoffRepository) Create(ctx context.Context, s *model.TicketSignoff) error {
	query := `
		INSERT INTO ticket_signoffs
			(ticket_id, file_url, file_name, file_type, file_size, signed_by_name, signed_at, note, uploaded_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at
	`
	return r.db.QueryRow(ctx, query,
		s.TicketID, s.FileURL, s.FileName, s.FileType, s.FileSize,
		s.SignedByName, s.SignedAt, s.Note, s.UploadedBy,
	).Scan(&s.ID, &s.CreatedAt)
}

// ListByTicket mengembalikan semua dokumen milik satu tiket, terbaru dulu.
func (r *TicketSignoffRepository) ListByTicket(ctx context.Context, ticketID string) ([]model.TicketSignoff, error) {
	rows, err := r.db.Query(ctx, signoffSelect+` WHERE s.ticket_id = $1 ORDER BY s.created_at DESC`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []model.TicketSignoff{}
	for rows.Next() {
		var s model.TicketSignoff
		if err := rows.Scan(
			&s.ID, &s.TicketID, &s.FileURL, &s.FileName, &s.FileType, &s.FileSize,
			&s.SignedByName, &s.SignedAt, &s.Note,
			&s.UploadedBy, &s.UploadedByName, &s.CreatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, rows.Err()
}

// LatestByTicket dipakai daftar tiket untuk menandai tiket mana yang sudah
// punya bukti serah-terima (badge "BAST ✓") tanpa perlu ambil semua dokumen.
func (r *TicketSignoffRepository) LatestByTicket(ctx context.Context, ticketID string) (*model.TicketSignoff, error) {
	return scanSignoff(r.db.QueryRow(ctx, signoffSelect+` WHERE s.ticket_id = $1 ORDER BY s.created_at DESC LIMIT 1`, ticketID))
}

func (r *TicketSignoffRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM ticket_signoffs WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrSignoffNotFound
	}
	return nil
}
