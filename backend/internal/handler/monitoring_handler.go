package handler

import (
	"log"
	"net/http"
	"time"

	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/service"
)

type MonitoringHandler struct {
	service *service.MonitoringService
	repo    *repository.MonitoringRepository
}

func NewMonitoringHandler(service *service.MonitoringService, repo *repository.MonitoringRepository) *MonitoringHandler {
	return &MonitoringHandler{service: service, repo: repo}
}

// GetDashboard melayani GET /api/v1/monitoring
//
// Query string (semua opsional):
//
//	period = day | month | year   (default: month)
//	year, month, day              (default: hari ini)
func (h *MonitoringHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	per, err := model.ParsePeriod(r.URL.Query(), time.Now())
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	data, err := h.service.GetExecutiveDashboardData(r.Context(), per)
	if err != nil {
		log.Printf("monitoring: gagal mengambil data (%s %s): %v", per.Kind, per.From.Format("2006-01-02"), err)
		respondError(w, http.StatusInternalServerError, "gagal mengambil data monitoring")
		return
	}
	respondJSON(w, http.StatusOK, data)
}
