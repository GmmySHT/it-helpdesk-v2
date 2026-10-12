package service

import (
	"context"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

type AssetDisposalService struct {
	repo *repository.AssetDisposalRepository
}

func NewAssetDisposalService(repo *repository.AssetDisposalRepository) *AssetDisposalService {
	return &AssetDisposalService{repo: repo}
}

// Create menambah record pemusnahan aset.
func (s *AssetDisposalService) Create(ctx context.Context, disposal *model.AssetDisposal) error {
	// Update status aset menjadi disposed
	// (Repository layer tidak disertakan karena perlu logic di service)
	return s.repo.Create(ctx, disposal)
}

// List mengambil daftar pemusnahan aset.
func (s *AssetDisposalService) List(ctx context.Context, limit int, offset int) ([]model.AssetDisposal, int64, error) {
	return s.repo.List(ctx, limit, offset)
}
