package repository

import (
	"context"
	"ticketing-it/backend/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AssetDisposalRepository struct {
	db *pgxpool.Pool
}

func NewAssetDisposalRepository(db *pgxpool.Pool) *AssetDisposalRepository {
	return &AssetDisposalRepository{db: db}
}

// Create menambah record pemusnahan aset.
func (r *AssetDisposalRepository) Create(ctx context.Context, disposal *model.AssetDisposal) error {
	query := `
		INSERT INTO asset_disposals 
		(asset_id, reason, disposal_method, disposed_by, certificate_number, notes)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, disposed_at, created_at
	`

	err := r.db.QueryRow(ctx, query,
		disposal.AssetID, disposal.Reason, disposal.DisposalMethod, disposal.DisposedBy,
		disposal.CertificateNumber, disposal.Notes,
	).Scan(&disposal.ID, &disposal.DisposedAt, &disposal.CreatedAt)

	return err
}

// List mengambil daftar pemusnahan aset dengan pagination.
func (r *AssetDisposalRepository) List(ctx context.Context, limit int, offset int) ([]model.AssetDisposal, int64, error) {
	query := `
		SELECT ad.id, ad.asset_id, a.code, a.name, ad.reason, ad.disposal_method,
		       ad.disposed_by, u.name, ad.disposed_at, ad.certificate_number, ad.notes, ad.created_at
		FROM asset_disposals ad
		LEFT JOIN assets a ON ad.asset_id = a.id
		LEFT JOIN users u ON ad.disposed_by = u.id
		ORDER BY ad.disposed_at DESC
		LIMIT $1 OFFSET $2
	`

	countQuery := "SELECT COUNT(*) FROM asset_disposals"

	var total int64
	err := r.db.QueryRow(ctx, countQuery).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.db.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	disposals := []model.AssetDisposal{}
	for rows.Next() {
		d := model.AssetDisposal{}
		err := rows.Scan(
			&d.ID, &d.AssetID, &d.AssetCode, &d.AssetName, &d.Reason, &d.DisposalMethod,
			&d.DisposedBy, &d.DisposerName, &d.DisposedAt, &d.CertificateNumber, &d.Notes, &d.CreatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		disposals = append(disposals, d)
	}

	return disposals, total, rows.Err()
}
