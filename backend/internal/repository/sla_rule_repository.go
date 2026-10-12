package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

var ErrSLARuleNotFound = errors.New("aturan SLA untuk kategori & prioritas ini belum diatur")

type SLARuleRepository struct {
	db *pgxpool.Pool
}

func NewSLARuleRepository(db *pgxpool.Pool) *SLARuleRepository {
	return &SLARuleRepository{db: db}
}

// FindByCategoryAndPriority dipakai saat tiket di-claim untuk menghitung sla_deadline.
// Kalau belum ada aturan yang diatur admin untuk kombinasi kategori+prioritas ini,
// service akan membiarkan sla_deadline kosong (tidak menghentikan proses claim).
func (r *SLARuleRepository) FindByCategoryAndPriority(ctx context.Context, categoryID string, priority model.TicketPriority) (*model.SLARule, error) {
	query := `
		SELECT id, category_id, priority, response_time_minutes, resolution_time_minutes
		FROM sla_rules
		WHERE category_id = $1 AND priority = $2
	`
	var rule model.SLARule
	err := r.db.QueryRow(ctx, query, categoryID, priority).Scan(
		&rule.ID, &rule.CategoryID, &rule.Priority, &rule.ResponseTimeMinutes, &rule.ResolutionTimeMinutes,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSLARuleNotFound
		}
		return nil, err
	}
	return &rule, nil
}
