package repository

import (
	"context"
	"errors"

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
