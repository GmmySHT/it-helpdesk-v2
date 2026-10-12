package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

type ModuleRepository struct {
	db *pgxpool.Pool
}

func NewModuleRepository(db *pgxpool.Pool) *ModuleRepository {
	return &ModuleRepository{db: db}
}

func (r *ModuleRepository) List(ctx context.Context) ([]model.Module, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, code, name, COALESCE(description, ''), is_active
		FROM modules
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var modules []model.Module
	for rows.Next() {
		var m model.Module
		if err := rows.Scan(&m.ID, &m.Code, &m.Name, &m.Description, &m.IsActive); err != nil {
			return nil, err
		}
		modules = append(modules, m)
	}
	return modules, rows.Err()
}

func (r *ModuleRepository) SetActive(ctx context.Context, moduleID string, isActive bool) error {
	_, err := r.db.Exec(ctx, `UPDATE modules SET is_active = $1 WHERE id = $2`, isActive, moduleID)
	return err
}
