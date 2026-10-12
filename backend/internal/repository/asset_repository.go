package repository

import (
	"context"
	"errors"
	"fmt"
	"ticketing-it/backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AssetRepository struct {
	db *pgxpool.Pool
}

func NewAssetRepository(db *pgxpool.Pool) *AssetRepository {
	return &AssetRepository{db: db}
}

// Create menambah aset baru.
func (r *AssetRepository) Create(ctx context.Context, asset *model.Asset) error {
	query := `
		INSERT INTO assets (category_id, code, name, brand, model, serial_number, condition, stock, location, notes, created_by)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8, $9, $10, $11)
		RETURNING id, created_at, updated_at
	`

	err := r.db.QueryRow(ctx, query,
		asset.CategoryID, asset.Code, asset.Name, asset.Brand, asset.Model,
		asset.SerialNumber, asset.Condition, asset.Stock, asset.Location,
		asset.Notes, asset.CreatedBy,
	).Scan(&asset.ID, &asset.CreatedAt, &asset.UpdatedAt)

	return err
}

// GetByID mengambil aset by ID dengan nama kategori dan stok tersedia.
func (r *AssetRepository) GetByID(ctx context.Context, id string) (*model.Asset, error) {
	query := `
		SELECT a.id, a.category_id, COALESCE(c.name, ''), a.code, a.name, 
		       COALESCE(a.brand, ''), COALESCE(a.model, ''), COALESCE(a.serial_number, ''), 
		       a.condition, a.stock, COALESCE(a.location, ''), COALESCE(a.notes, ''), 
		       a.created_by, a.created_at, a.updated_at,
		       COALESCE(a.stock - COALESCE((SELECT SUM(quantity) FROM asset_borrowings WHERE asset_id = a.id AND status IN ('pending_approval', 'approved', 'borrowed')), 0), a.stock) AS available_stock
		FROM assets a
		LEFT JOIN asset_categories c ON a.category_id = c.id
		WHERE a.id = $1
	`

	asset := &model.Asset{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&asset.ID, &asset.CategoryID, &asset.CategoryName, &asset.Code, &asset.Name,
		&asset.Brand, &asset.Model, &asset.SerialNumber, &asset.Condition, &asset.Stock,
		&asset.Location, &asset.Notes, &asset.CreatedBy, &asset.CreatedAt, &asset.UpdatedAt, &asset.AvailableStock,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, errors.New("asset not found")
		}
		return nil, err
	}

	return asset, nil
}

// GetTotalBorrowed mengambil total qty yang sedang dipinjam (pending_approval, approved, atau borrowed).
func (r *AssetRepository) GetTotalBorrowed(ctx context.Context, assetID string) (int64, error) {
	var total int64
	query := `
		SELECT COALESCE(SUM(quantity), 0)
		FROM asset_borrowings
		WHERE asset_id = $1 AND status IN ('pending_approval', 'approved', 'borrowed')
	`
	err := r.db.QueryRow(ctx, query, assetID).Scan(&total)
	return total, err
}

// List mengambil daftar aset dengan filter & pagination.
// Setiap aset juga menampilkan available_stock = stock - qty yang sedang dipinjam
func (r *AssetRepository) List(ctx context.Context, categoryID string, condition string, limit int, offset int) ([]model.Asset, int64, error) {
	query := `
		SELECT a.id, a.category_id, COALESCE(c.name, ''), a.code, a.name, 
		       COALESCE(a.brand, ''), COALESCE(a.model, ''), COALESCE(a.serial_number, ''),
		       a.condition, a.stock, COALESCE(a.location, ''), COALESCE(a.notes, ''), 
		       a.created_by, a.created_at, a.updated_at,
		       COALESCE(a.stock - COALESCE((SELECT SUM(quantity) FROM asset_borrowings WHERE asset_id = a.id AND status IN ('pending_approval', 'approved', 'borrowed')), 0), a.stock) AS available_stock
		FROM assets a
		LEFT JOIN asset_categories c ON a.category_id = c.id
		WHERE 1=1
	`
	countQuery := "SELECT COUNT(*) FROM assets WHERE 1=1"
	args := []interface{}{}
	argIdx := 1

	if categoryID != "" {
		query += " AND a.category_id = $" + fmt.Sprintf("%d", argIdx)
		countQuery += " AND category_id = $" + fmt.Sprintf("%d", argIdx)
		args = append(args, categoryID)
		argIdx++
	}

	if condition != "" {
		query += " AND a.condition = $" + fmt.Sprintf("%d", argIdx)
		countQuery += " AND condition = $" + fmt.Sprintf("%d", argIdx)
		args = append(args, condition)
		argIdx++
	}

	query += " ORDER BY a.created_at DESC LIMIT $" + fmt.Sprintf("%d", argIdx) + " OFFSET $" + fmt.Sprintf("%d", argIdx+1)

	var total int64
	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.db.Query(ctx, query, append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	assets := []model.Asset{}
	for rows.Next() {
		a := model.Asset{}
		err := rows.Scan(
			&a.ID, &a.CategoryID, &a.CategoryName, &a.Code, &a.Name, &a.Brand, &a.Model,
			&a.SerialNumber, &a.Condition, &a.Stock, &a.Location, &a.Notes, &a.CreatedBy,
			&a.CreatedAt, &a.UpdatedAt, &a.AvailableStock,
		)
		if err != nil {
			return nil, 0, err
		}
		assets = append(assets, a)
	}

	return assets, total, rows.Err()
}

// Update mengubah data aset.
func (r *AssetRepository) Update(ctx context.Context, id string, asset *model.Asset) error {
	query := `
		UPDATE assets
		SET category_id=$1, code=$2, name=$3, brand=$4, model=$5, serial_number=$6,
		    condition=$7, stock=$8, location=$9, notes=$10, updated_at=NOW()
		WHERE id=$11
		RETURNING updated_at
	`

	err := r.db.QueryRow(ctx, query,
		asset.CategoryID, asset.Code, asset.Name, asset.Brand, asset.Model,
		asset.SerialNumber, asset.Condition, asset.Stock, asset.Location,
		asset.Notes, id,
	).Scan(&asset.UpdatedAt)

	return err
}

// Delete menghapus aset.
func (r *AssetRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM assets WHERE id = $1", id)
	return err
}

// GetCategoryByID mengambil kategori by ID.
func (r *AssetRepository) GetCategoryByID(ctx context.Context, id string) (*model.AssetCategory, error) {
	category := &model.AssetCategory{}
	err := r.db.QueryRow(ctx, "SELECT id, name, description, created_at, updated_at FROM asset_categories WHERE id = $1", id).
		Scan(&category.ID, &category.Name, &category.Description, &category.CreatedAt, &category.UpdatedAt)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, errors.New("category not found")
		}
		return nil, err
	}

	return category, nil
}

// ListCategories mengambil semua kategori.
func (r *AssetRepository) ListCategories(ctx context.Context) ([]model.AssetCategory, error) {
	rows, err := r.db.Query(ctx, "SELECT id, name, description, created_at, updated_at FROM asset_categories ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	categories := []model.AssetCategory{}
	for rows.Next() {
		c := model.AssetCategory{}
		err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}

	return categories, rows.Err()
}
