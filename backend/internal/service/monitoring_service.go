package service

import (
	"context"

	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

type MonitoringService struct {
	repo *repository.MonitoringRepository
}

func NewMonitoringService(repo *repository.MonitoringRepository) *MonitoringService {
	return &MonitoringService{repo: repo}
}

func (s *MonitoringService) GetExecutiveDashboardData(ctx context.Context, per model.Period) (map[string]interface{}, error) {
	config, _ := s.repo.GetConfig(ctx, "executive-monitoring")
	stats, _ := s.repo.GetRealtimeStats(ctx, per)
	patients, _ := s.repo.GetPatientStats(ctx, per)
	rooms, _ := s.repo.GetRoomStats(ctx, per)
	components, _ := s.repo.GetComponentStats(ctx, per)
	trend, _ := s.repo.GetTrend(ctx, per)
	trendPrev, _ := s.repo.GetTrend(ctx, per.Previous())
	active, _ := s.repo.GetActiveSummary(ctx)

	// FARMASI DATA
	pharmacySummary, _ := s.repo.GetPharmacySummary(ctx, per)
	pharmacySales, _ := s.repo.GetPharmacySales(ctx, per, 10)
	drugStock, _ := s.repo.GetDrugStock(ctx)
	pharmacyRooms, _ := s.repo.GetPharmacyRoomStats(ctx, per)

	return map[string]interface{}{
		"config":           config,
		"stats":            stats,
		"patients":         patients,
		"rooms":            rooms,
		"components":       components,
		"trend":            trend,
		"trend_prev":       trendPrev,
		"active":           active,
		"pharmacy_summary": pharmacySummary,
		"pharmacy_sales":   pharmacySales,
		"drug_stock":       drugStock,
		"pharmacy_rooms":   pharmacyRooms,
	}, nil
}

func (s *MonitoringService) GetPharmacyData(ctx context.Context, per model.Period) (map[string]interface{}, error) {
	pharmacySummary, _ := s.repo.GetPharmacySummary(ctx, per)
	pharmacySales, _ := s.repo.GetPharmacySales(ctx, per, 20)
	drugStock, _ := s.repo.GetDrugStock(ctx)
	pharmacyRooms, _ := s.repo.GetPharmacyRoomStats(ctx, per)

	return map[string]interface{}{
		"pharmacy_summary": pharmacySummary,
		"pharmacy_sales":   pharmacySales,
		"drug_stock":       drugStock,
		"pharmacy_rooms":   pharmacyRooms,
	}, nil
}
