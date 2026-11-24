package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

var ErrRatingAlreadyExists = errors.New("tiket ini sudah pernah dinilai sebelumnya")
var ErrRatingNotFound = errors.New("tiket ini belum dinilai")

type RatingRepository struct {
	db *pgxpool.Pool
}

func NewRatingRepository(db *pgxpool.Pool) *RatingRepository {
	return &RatingRepository{db: db}
}

func (r *RatingRepository) Create(ctx context.Context, rating *model.Rating) error {
	query := `
		INSERT INTO ratings (ticket_id, score, comment)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`
	err := r.db.QueryRow(ctx, query, rating.TicketID, rating.Score, rating.Comment).
		Scan(&rating.ID, &rating.CreatedAt)
	if err != nil {
		if pgErrCode(err) == "23505" { // unique_violation dari kolom ticket_id
			return ErrRatingAlreadyExists
		}
		return err
	}
	return nil
}

func (r *RatingRepository) FindByTicket(ctx context.Context, ticketID string) (*model.Rating, error) {
	query := `
		SELECT id, ticket_id, score, COALESCE(comment, ''), created_at
		FROM ratings
		WHERE ticket_id = $1
	`
	var rating model.Rating
	err := r.db.QueryRow(ctx, query, ticketID).Scan(
		&rating.ID, &rating.TicketID, &rating.Score, &rating.Comment, &rating.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrRatingNotFound
		}
		return nil, err
	}
	return &rating, nil
}

// AverageScore dipakai nanti untuk kartu KPI "rata-rata kepuasan" di dashboard.
func (r *RatingRepository) AverageScore(ctx context.Context) (float64, int, error) {
	var avg float64
	var count int
	err := r.db.QueryRow(ctx, `SELECT COALESCE(AVG(score), 0), COUNT(*) FROM ratings`).
		Scan(&avg, &count)
	return avg, count, err
}

// UnratedTicket adalah tiket closed milik pemanggil yang belum dinilai.
// Dipakai dashboard pelapor agar tidak perlu N+1 getRating per tiket.
type UnratedTicket struct {
	ID       string     `json:"id"`
	Code     *string    `json:"ticket_code"`
	Title    string     `json:"title"`
	ClosedAt *time.Time `json:"closed_at"`
}

func (r *RatingRepository) ListUnratedClosedByCreator(ctx context.Context, userID string, limit int) ([]UnratedTicket, error) {
	if limit <= 0 || limit > 20 {
		limit = 5
	}
	rows, err := r.db.Query(ctx, `
		SELECT t.id, t.ticket_code, t.title, t.closed_at
		FROM tickets t
		LEFT JOIN ratings r ON r.ticket_id = t.id
		WHERE t.deleted_at IS NULL
		  AND t.ticket_type = 'regular'
		  AND t.status = 'closed'
		  AND (t.created_by = $1 OR t.created_for = $1)
		  AND r.id IS NULL
		  -- Tiket yang ditolak langsung closed tanpa pernah resolve; bukan kandidat rating.
		  AND t.last_resolved_at IS NOT NULL
		ORDER BY t.closed_at DESC NULLS LAST
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []UnratedTicket
	for rows.Next() {
		var t UnratedTicket
		if err := rows.Scan(&t.ID, &t.Code, &t.Title, &t.ClosedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
