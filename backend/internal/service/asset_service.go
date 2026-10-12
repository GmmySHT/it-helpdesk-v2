package service

import (
	"context"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

type AssetService struct {
	repo *repository.AssetRepository
}

func NewAssetService(repo *repository.AssetRepository) *AssetService {
	return &AssetService{repo: repo}
}

// Create menambah aset baru.
func (s *AssetService) Create(ctx context.Context, asset *model.Asset) error {
	// Validasi kode aset unik
	// Validasi category_id ada
	return s.repo.Create(ctx, asset)
}

// GetByID mengambil detail aset.
func (s *AssetService) GetByID(ctx context.Context, id string) (*model.Asset, error) {
	return s.repo.GetByID(ctx, id)
}

// List mengambil daftar aset dengan filter.
func (s *AssetService) List(ctx context.Context, categoryID string, condition string, limit int, offset int) ([]model.Asset, int64, error) {
	// Repository query sudah hitung available_stock (stock - qty pending/approved/borrowed)
	assets, total, err := s.repo.List(ctx, categoryID, condition, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	return assets, total, nil
}

// Update mengubah data aset.
func (s *AssetService) Update(ctx context.Context, id string, asset *model.Asset) error {
	return s.repo.Update(ctx, id, asset)
}

// Delete menghapus aset.
func (s *AssetService) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}

// ListCategories mengambil semua kategori aset.
func (s *AssetService) ListCategories(ctx context.Context) ([]model.AssetCategory, error) {
	return s.repo.ListCategories(ctx)
}

// GetAvailableStock menghitung stok yang tersedia untuk dipinjam (total - sedang dipinjam).
func (s *AssetService) GetAvailableStock(ctx context.Context, assetID string) (int, error) {
	asset, err := s.repo.GetByID(ctx, assetID)
	if err != nil {
		return 0, err
	}

	borrowed, err := s.repo.GetTotalBorrowed(ctx, assetID)
	if err != nil {
		return 0, err
	}

	available := asset.Stock - int(borrowed)
	if available < 0 {
		available = 0
	}
	return available, nil
}
