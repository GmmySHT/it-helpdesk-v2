package service

import (
	"context"
	"strconv"

	"ticketing-it/backend/internal/repository"
)

type DashboardConfigService struct {
	repo *repository.DashboardConfigRepository
}

func NewDashboardConfigService(repo *repository.DashboardConfigRepository) *DashboardConfigService {
	return &DashboardConfigService{repo: repo}
}

// GetMonthlyRevenueTarget mengambil target pendapatan bulanan
func (s *DashboardConfigService) GetMonthlyRevenueTarget(ctx context.Context) (int64, error) {
	val, err := s.repo.GetConfig(ctx, "monthly_revenue_target")
	if err != nil {
		// default 8.5 miliar jika tidak ada
		return 8500000000, nil
	}
	target, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return 8500000000, nil
	}
	return target, nil
}

// SetMonthlyRevenueTarget menyimpan target pendapatan bulanan
func (s *DashboardConfigService) SetMonthlyRevenueTarget(ctx context.Context, target int64) error {
	return s.repo.SetConfig(ctx, "monthly_revenue_target", strconv.FormatInt(target, 10))
}
