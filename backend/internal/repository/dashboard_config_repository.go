package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DashboardConfigRepository struct {
	pool *pgxpool.Pool
}

func NewDashboardConfigRepository(pool *pgxpool.Pool) *DashboardConfigRepository {
	return &DashboardConfigRepository{pool: pool}
}

// GetConfig mengambil nilai config berdasarkan key
func (r *DashboardConfigRepository) GetConfig(ctx context.Context, key string) (string, error) {
	var value string
	err := r.pool.QueryRow(
		ctx,
		"SELECT config_value FROM dashboard_configs WHERE config_key = $1",
		key,
	).Scan(&value)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("config not found: %s", key)
	}
	if err != nil {
		return "", err
	}
	return value, nil
}

// SetConfig menyimpan/update config
func (r *DashboardConfigRepository) SetConfig(ctx context.Context, key, value string) error {
	_, err := r.pool.Exec(
		ctx,
		`INSERT INTO dashboard_configs (config_key, config_value) 
		 VALUES ($1, $2) 
		 ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = CURRENT_TIMESTAMP`,
		key, value,
	)
	return err
}

// GetAllConfigs mengambil semua config
func (r *DashboardConfigRepository) GetAllConfigs(ctx context.Context) (map[string]string, error) {
	rows, err := r.pool.Query(ctx, "SELECT config_key, config_value FROM dashboard_configs")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	configs := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		configs[key] = value
	}
	return configs, rows.Err()
}
