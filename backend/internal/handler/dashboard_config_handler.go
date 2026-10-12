package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"ticketing-it/backend/internal/service"
)

type DashboardConfigHandler struct {
	service *service.DashboardConfigService
}

func NewDashboardConfigHandler(service *service.DashboardConfigService) *DashboardConfigHandler {
	return &DashboardConfigHandler{service: service}
}

// GetMonthlyRevenueTarget GET /api/v1/dashboard/configs/monthly-revenue-target
func (h *DashboardConfigHandler) GetMonthlyRevenueTarget(w http.ResponseWriter, r *http.Request) {
	target, err := h.service.GetMonthlyRevenueTarget(r.Context())
	if err != nil {
		log.Printf("error get revenue target: %v", err)
		respondError(w, http.StatusInternalServerError, "gagal mengambil target pendapatan")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"monthly_revenue_target": target,
	})
}

// UpdateMonthlyRevenueTarget PUT /api/v1/dashboard/configs/monthly-revenue-target
// Body: {"monthly_revenue_target": 9500000000}
func (h *DashboardConfigHandler) UpdateMonthlyRevenueTarget(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MonthlyRevenueTarget int64 `json:"monthly_revenue_target"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.MonthlyRevenueTarget <= 0 {
		respondError(w, http.StatusBadRequest, "target harus positif")
		return
	}

	if err := h.service.SetMonthlyRevenueTarget(r.Context(), req.MonthlyRevenueTarget); err != nil {
		log.Printf("error update revenue target: %v", err)
		respondError(w, http.StatusInternalServerError, "gagal menyimpan target pendapatan")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":                  "target pendapatan berhasil diperbarui",
		"monthly_revenue_target":   req.MonthlyRevenueTarget,
	})
}
