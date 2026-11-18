package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

type CategoryRepository struct {
	db *pgxpool.Pool
}

func NewCategoryRepository(db *pgxpool.Pool) *CategoryRepository {
	return &CategoryRepository{db: db}
}

func (r *CategoryRepository) List(ctx context.Context) ([]model.Category, error) {
	rows, err := r.db.Query(ctx, `SELECT id, name, COALESCE(description, ''), COALESCE(code, ''), requires_analysis_approval FROM categories ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []model.Category
	for rows.Next() {
		var c model.Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.Code, &c.RequiresAnalysisApproval); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}
	return categories, rows.Err()
}

// UpdateApprovalGate mengubah default gate persetujuan analisa untuk satu
// kategori. Override per tiket (tickets.analysis_approval_required) tetap
// berlaku kalau diisi.
func (r *CategoryRepository) UpdateApprovalGate(ctx context.Context, id string, required bool) (*model.Category, error) {
	var c model.Category
	err := r.db.QueryRow(ctx, `
		UPDATE categories SET requires_analysis_approval = $2
		WHERE id = $1::uuid
		RETURNING id, name, COALESCE(description, ''), COALESCE(code, ''), requires_analysis_approval`,
		id, required).Scan(
		&c.ID, &c.Name, &c.Description, &c.Code, &c.RequiresAnalysisApproval,
	)
	return &c, err
}
