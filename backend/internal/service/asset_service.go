package service

import (
	"context"
	"fmt"
	"strings"

	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

// AssetValidationError membawa pesan yang aman ditampilkan langsung ke user.
type AssetValidationError struct{ Message string }

func (e *AssetValidationError) Error() string { return e.Message }

var validAssetConditions = map[model.AssetCondition]bool{
	model.AssetConditionAvailable:        true,
	model.AssetConditionBorrowed:         true,
	model.AssetConditionNeedsRepair:      true,
	model.AssetConditionBroken:           true,
	model.AssetConditionAwaitingDisposal: true,
	model.AssetConditionDisposed:         true,
}

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

// Update mengubah data aset. Semua field dikirim ulang oleh frontend
// (bukan partial update), jadi di sini divalidasi lengkap.
func (s *AssetService) Update(ctx context.Context, id string, asset *model.Asset) error {
	asset.CategoryID = strings.TrimSpace(asset.CategoryID)
	asset.Code = strings.TrimSpace(asset.Code)
	asset.Name = strings.TrimSpace(asset.Name)
	asset.Brand = strings.TrimSpace(asset.Brand)
	asset.Model = strings.TrimSpace(asset.Model)
	asset.SerialNumber = strings.TrimSpace(asset.SerialNumber)
	asset.Location = strings.TrimSpace(asset.Location)
	asset.Notes = strings.TrimSpace(asset.Notes)

	if asset.CategoryID == "" || asset.Code == "" || asset.Name == "" {
		return &AssetValidationError{"kategori, kode, dan nama aset wajib diisi"}
	}
	if !validAssetConditions[asset.Condition] {
		return &AssetValidationError{"kondisi aset tidak valid"}
	}
	if asset.Stock < 0 {
		return &AssetValidationError{"stok tidak boleh negatif"}
	}

	// Pastikan aset ada, sekaligus cek stok baru tidak lebih kecil dari
	// jumlah yang sedang diajukan/disetujui/dipinjam.
	if _, err := s.repo.GetByID(ctx, id); err != nil {
		return err
	}
	borrowed, err := s.repo.GetTotalBorrowed(ctx, id)
	if err != nil {
		return err
	}
	if int64(asset.Stock) < borrowed {
		return &AssetValidationError{fmt.Sprintf(
			"stok tidak boleh kurang dari %d unit yang sedang diajukan/dipinjam", borrowed)}
	}

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
